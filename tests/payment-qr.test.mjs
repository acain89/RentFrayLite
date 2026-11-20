import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { renderToStaticMarkup } from "react-dom/server";
import { authHarness } from "./helpers/auth-harness.mjs";

async function fixture() {
  const h = await authHarness("isolated", undefined, {
    qrcode: { __esModule: true, default: QRCode },
    "./PrintControls": { __esModule: true, default: () => null },
  });
  for (let index = 0; index < 2; index++) await h.db.business.update({
    where: { id: h.businesses[index].id },
    data: { name: index ? "Other Fixture Rentals" : "Willow Grove Rentals", accountCode: index ? "CD-5678" : "AB-1234", accountCodeLockedAt: new Date() },
  });
  return h;
}

test("QR destination uses existing normalization and fixed canonical origin only", async () => {
  const h = await fixture(); const create = h.load("lib/paymentQr.ts").createPaymentQr;
  for (const code of ["AB-1234", "ab1234", " ab-1234 "]) {
    const qr = create(code); assert.equal(qr.url, "https://rentfraylite.com/AB-1234");
    assert.equal(qr.accountCode, "AB-1234");
    const points = [...qr.path.matchAll(/M(\d+),(\d+)/g)].map(m => [+m[1], +m[2]]);
    assert.ok(points.length > 0); assert.ok(points.every(([x,y]) => x >= 4 && y >= 4 && x < qr.size - 4 && y < qr.size - 4));
  }
  for (const bad of ["", "-", "https://attacker.test", "AB-123456", "AB-1234?token=secret", "../AB-1234"]) assert.throws(() => create(bad));
});

for (const index of [0, 1]) test(`manager ${index}: page ignores supplied identity and displays only own permanent code`, async () => {
  const h = await fixture(); await h.issue("MANAGER", index);
  const page = h.load("app/manager/payment-qr/page.tsx");
  const element = await page.default({ searchParams: Promise.resolve({ businessId: h.businesses[1-index].id, accountCode: index ? "AB-1234" : "CD-5678" }) });
  const article = element.props.children.find(child => child.type === "article");
  const svg = article.props.children.find(child => child.type === "svg");
  assert.equal(typeof svg.props.children.find(child => child.type === "title").props.children, "string");
  const html = renderToStaticMarkup(element);
  assert.match(html, new RegExp(index ? "https://rentfraylite.com/CD-5678" : "https://rentfraylite.com/AB-1234"));
  assert.doesNotMatch(html, new RegExp(index ? "Willow Grove Rentals" : "Other Fixture Rentals"));
  assert.match(html, /Scan QR code to see payment options\./); assert.match(html, /<svg /);
  for (const business of h.businesses) assert.ok(!html.includes(business.id));
  assert.deepEqual(page.metadata.robots, { index:false, follow:false }); assert.equal(page.dynamic, "force-dynamic");
});

test("unauthenticated and administrator sessions cannot access the manager QR page", async () => {
  const h = await fixture(); const page=h.load("app/manager/payment-qr/page.tsx");
  await assert.rejects(page.default(), /REDIRECT \/login\/manager/);
  await h.issue("ADMIN"); await assert.rejects(page.default(), /REDIRECT \/login\/manager/);
});

test("unlocked/missing codes are not published; inactive managers are rejected", async () => {
  const h = await fixture(); await h.issue(); const page=h.load("app/manager/payment-qr/page.tsx");
  await h.db.business.update({where:{id:h.businesses[0].id},data:{accountCodeLockedAt:null}});
  await assert.rejects(page.default(), /REDIRECT \/setup\/account-code/);
  await h.db.business.update({where:{id:h.businesses[0].id},data:{accountCode:null}});
  await assert.rejects(page.default(), /REDIRECT \/setup\/account-code/);
  await h.db.manager.update({where:{id:h.managers[0].id},data:{isActive:false}});
  await assert.rejects(page.default(), /REDIRECT \/login\/manager/);
});

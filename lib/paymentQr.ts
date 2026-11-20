import QRCode from "qrcode";
import { ACCOUNT_CODE_PATTERN, normalizeAccountCode } from "@/lib/accountCode";
import { RFL_PUBLIC_ORIGIN } from "@/lib/publicMetadata";

export function createPaymentQr(rawAccountCode: string) {
  const input = rawAccountCode.trim().toUpperCase();
  if (!/^[A-Z]{2}-?\d{4}$/.test(input)) throw new Error("A permanent account code is required.");
  const accountCode = normalizeAccountCode(input);
  if (!ACCOUNT_CODE_PATTERN.test(accountCode)) throw new Error("Invalid account code.");
  const url = new URL("/" + accountCode, RFL_PUBLIC_ORIGIN).href;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const quietZone = 4;
  const size = qr.modules.size + quietZone * 2;
  const squares: string[] = [];
  for (let row = 0; row < qr.modules.size; row++) {
    for (let column = 0; column < qr.modules.size; column++) {
      if (qr.modules.get(row, column)) squares.push(`M${column + quietZone},${row + quietZone}h1v1h-1z`);
    }
  }
  return { accountCode, url, size, path: squares.join("") };
}

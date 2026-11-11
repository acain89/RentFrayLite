import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Consent authorization may evolve; checkout pricing and persisted financial
// payloads must still match each historical financial architecture baseline.
export function assertCheckoutFinancialSource(baseline) {
  const file = 'app/api/public/checkout/session/route.ts';
  const protectedSource = text => {
    // Package 2 moves only architecture preparation behind a server-only adapter.
    // Restore that exact spread for historical payload comparison; quote calls,
    // amounts, dates and all remaining persisted fields still compare verbatim.
    if (text.includes('prepareVersionedCheckoutQuote')) {
      assert.equal((text.match(/\.\.\.architecture\b/g) ?? []).length, 2);
      assert.equal((text.match(/publicQuoteArchitecture\(business\.stripeConnection!\.stripeAccountId\)/g) ?? []).length, 2);
      text = text.replaceAll('...architecture', '...legacyCheckoutArchitecture(business.stripeConnection!.stripeAccountId, pricing.subtotalCents, pricing.platformFeeCents)');
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const printer = ts.createPrinter({ removeComments: true }), result = [];
    const consent = node => ts.isSpreadAssignment(node) && ['consent', 'savedConsent'].includes(node.expression.getText(source));
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (['quoteCustomPayment', 'quoteStandardCheckout', 'legacyCheckoutArchitecture', 'getCheckoutCalendar', 'loadCurrentCheckoutPlan'].includes(name)) result.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
        if (name === 'tx.checkoutSession.create') {
          const normalized = ts.transform(node, [context => root => ts.visitNode(root, function strip(n) {
            if (ts.isObjectLiteralExpression(n)) return context.factory.updateObjectLiteralExpression(n, n.properties.filter(p => !consent(p)).map(p => ts.visitNode(p, strip)));
            return ts.visitEachChild(n, strip, context);
          })]);
          result.push(printer.printNode(ts.EmitHint.Unspecified, normalized.transformed[0], source)); normalized.dispose();
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source); assert.ok(result.length >= 6, 'Both financial creation paths must be inspected'); return result;
  };
  assert.deepEqual(protectedSource(readFileSync(file, 'utf8')), protectedSource(execFileSync('git', ['show', baseline+':'+file], { encoding: 'utf8', windowsHide: true })), file+' financial pricing and persistence');
}

// Public ingress may change; every statement after admission remains identical.
// Compare the entire normalized start handler against the historical baseline,
// including locks, snapshot checks, reservation, Stripe parameters and errors.
export function assertCheckoutStartSource(baseline) {
  const file='app/api/public/checkout/start/route.ts';
  const original=execFileSync('git',['show',baseline+':'+file],{encoding:'utf8',windowsHide:true});
  const current=historicalCheckoutSource(file,readFileSync(file,'utf8'));
  const normalize=(text,modified)=>{
    if(modified){
      text=text.replace(/^import \{ publicJson, publicJsonFailure \} from [^;]+;\r?\n/m,'')
        .replace(/^import \{ publicRequestGuard \} from [^;]+;\r?\n/m,'')
        .replace('publicJson(request, 1024)','request.json()')
        .replace(/\} catch \(error\) \{\s*return publicJsonFailure\(error\);\s*\}/,'} catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }')
        .replace(/  const denied = await publicRequestGuard\(prisma, "START", checkoutSessionId\);\s*if \(denied\) return denied;/,'')
        .replace('!checkoutSessionId || checkoutSessionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(checkoutSessionId)','!checkoutSessionId');
    }
    text=text.replace(/^import \{ logOperationalError \} from "@\/lib\/operationalLogging";\r?\n/m,'')
      .replace('normalizeStripeLineItems, isStripeCheckoutTransportWithinLimit, STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS','normalizeStripeLineItems, isStripeCheckoutTransportWithinLimit')
      .replace('error instanceof Error ? error.message : "Invalid payment quote. Begin a new checkout."','"Invalid payment quote. Begin a new checkout."');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    // Only diagnostics are excluded; every financial/recovery statement remains.
    const clean=ts.transform(source,[context=>root=>ts.visitNode(root,function visit(node){
      if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&['console.error','logOperationalError'].includes(node.expression.expression.getText(source)))return undefined;
      return ts.visitEachChild(node,visit,context);
    })]);
    const printed=ts.createPrinter({removeComments:true}).printFile(clean.transformed[0]);clean.dispose();return printed;
  };
  assert.deepEqual(normalize(current,true),normalize(original,false),'Checkout start financial and authorization body');
}

// Reverse only explicitly approved quote-ownership and request-admission deltas
// for historical assertions. Unrelated financial/dispatch source edits still fail.
export function historicalCheckoutSource(file, text) {
  text = text.replaceAll('\r\n', '\n');
  if (file === 'lib/passwordRecovery.ts') {
    // S6-P2 changes only this import, public wording and issuance-opening guard.
    // Require exact placement before any lookup/randomness; never normalize the
    // consume path, credential checks, expiry, revocation or other statements.
    for (const [after, before] of [
      ["import {passwordResetEmail,passwordRecoveryReady,type PasswordResetEmailSender} from \"@/lib/passwordResetEmail\";\n", "import {passwordResetEmail,type PasswordResetEmailSender} from \"@/lib/passwordResetEmail\";\n"],
      ["export const RESET_REQUEST_CONFIRMATION=\"If an eligible account exists and recovery is available, a reset email may be sent. Delivery is not confirmed. Check your inbox and spam folder, or contact your business administrator for assistance.\";\n", "export const RESET_REQUEST_CONFIRMATION=\"If an eligible account exists for that email, a password-reset link will be sent. Check your inbox and spam folder.\";\n"],
      ["export async function requestManagementPasswordReset(db:PrismaClient,email:string,sender:PasswordResetEmailSender,env:CredentialEnvironment=process.env){\n  if(!passwordRecoveryReady(env))return;\n", "export async function requestManagementPasswordReset(db:PrismaClient,email:string,sender:PasswordResetEmailSender,env:CredentialEnvironment=process.env){\n"],
    ]) {
      assert.equal(text.split(after).length - 1, 1, 'Exact approved contextual S6-P2 recovery delta');
      text = text.replace(after, before);
    }
  }
  if (file === 'lib/smsDelivery.ts') {
    // Exact P2 read-only freshness additions; all claims, consent, callbacks,
    // retry and provider-operation statements still compare in full.
    for (const delta of [
      'import { CUSTOMER_REFUND_REPORT_SELECT, loadReportingDisputeOutcome, projectPaymentOutcome } from "@/lib/paymentReportingOutcome";\n',
      "      if(!reason){\n        // The Payment lock also serializes refund/dispute observation writers.\n        // Read durable facts here, never a provider or an enqueue-time snapshot.\n        const customerRefunds=await tx.customerRefundObservation.findMany({where:{paymentId:p.id},select:CUSTOMER_REFUND_REPORT_SELECT});\n        const outcome=projectPaymentOutcome({...p,customerRefunds,disputeOutcome:await loadReportingDisputeOutcome(tx,p)});\n        if(customerRefunds.length&&outcome.refundState===\"UNKNOWN\")reason=\"REFUND_OUTCOME_UNVERIFIED\";\n        else if([\"FULL\",\"PARTIAL\",\"PENDING\"].includes(outcome.refundState))reason=\"SUPERSEDED_REFUND_OUTCOME\";\n        else if(n.paymentState===\"DISPUTED\"&&outcome.disputeOutcome!==\"ACTIVE\")reason=\"SUPERSEDED_DISPUTE_OUTCOME\";\n        else if(n.paymentState===\"PAID\"&&outcome.disputeOutcome&&outcome.disputeOutcome!==\"WON\")reason=\"SUPERSEDED_DISPUTE_OUTCOME\";\n      }\n",
    ]) {
      assert.equal(text.split(delta).length - 1, 1, 'Exact approved SMS freshness delta');
      text = text.replace(delta, '');
    }
  }
  if (file === 'lib/paymentResult.ts') {
    const deltas = [
      // S5-IV-01: reverse only the exact storage-error sanitization wrapper.
      ["import { logOperationalError } from \"@/lib/operationalLogging\";\n", ""],
      ["// Only storage operations enter this boundary. Replace the exception without a\n// cause so framework render logging cannot serialize private query details.\nasync function resultStorage<T>(reference: string, operation: () => Promise<T>): Promise<T> {\n  try {\n    return await operation();\n  } catch (error) {\n    logOperationalError(\"payment_result_failed\", error, reference);\n    throw new Error(\"Payment result unavailable. Please try again.\");\n  }\n}\n\n", ""],
      ["  const checkout = await resultStorage(stripeSessionId, () => prisma.checkoutSession.findUnique({\n    where: { stripeCheckoutSessionId: stripeSessionId },\n    select: { id: true, businessId: true, accountCode: true, paymentId: true },\n  }));\n", "  const checkout = await prisma.checkoutSession.findUnique({\n    where: { stripeCheckoutSessionId: stripeSessionId },\n    select: { id: true, businessId: true, accountCode: true, paymentId: true },\n  });\n"],
      ["  const paymentId = checkout.paymentId;\n  const payment = await resultStorage(paymentId, () => prisma.payment.findUnique({\n    where: { id: paymentId },\n    select: {\n      id: true, businessId: true, stripeCheckoutSessionId: true,\n      status: true, paymentMethod: true, itemDescription: true, referenceLabel: true,\n      subtotalCents: true, platformFeeCents: true, totalChargedCents: true,\n      lineItemsSnapshot: true, createdAt: true, checkoutStartedAt: true,\n      pendingAt: true, paidAt: true, failedAt: true, expiredAt: true,\n      returnedAt: true, disputedAt: true,\n      customerRefunds: { select: CUSTOMER_REFUND_REPORT_SELECT },\n      business: { select: { id: true, name: true, accountCode: true, propertyTimeZone: true } },\n      smsReceipt: { select: { status: true } },\n      smsNotifications: { where: TENANT_RECEIPT_NOTIFICATION, orderBy: [{ createdAt: \"desc\" }, { id: \"desc\" }], take: 1, select: SMS_REPORT_SELECT },\n    },\n  }));\n", "  const payment = await prisma.payment.findUnique({\n    where: { id: checkout.paymentId },\n    select: {\n      id: true, businessId: true, stripeCheckoutSessionId: true,\n      status: true, paymentMethod: true, itemDescription: true, referenceLabel: true,\n      subtotalCents: true, platformFeeCents: true, totalChargedCents: true,\n      lineItemsSnapshot: true, createdAt: true, checkoutStartedAt: true,\n      pendingAt: true, paidAt: true, failedAt: true, expiredAt: true,\n      returnedAt: true, disputedAt: true,\n      customerRefunds: { select: CUSTOMER_REFUND_REPORT_SELECT },\n      business: { select: { id: true, name: true, accountCode: true, propertyTimeZone: true } },\n      smsReceipt: { select: { status: true } },\n      smsNotifications: { where: TENANT_RECEIPT_NOTIFICATION, orderBy: [{ createdAt: \"desc\" }, { id: \"desc\" }], take: 1, select: SMS_REPORT_SELECT },\n    },\n  });\n"],
      ["await resultStorage(payment.id, () => loadReportingDisputeOutcome(prisma, payment))", "await loadReportingDisputeOutcome(prisma, payment)"],
      // P4 adds only the configured display timezone to the owned business read.
      ['      business: { select: { id: true, name: true, accountCode: true, propertyTimeZone: true } },\n', '      business: { select: { id: true, name: true, accountCode: true } },\n'],
      // Stage 5 P1 adds only these exact read-only SMS projection statements.
      // Reverse them before the existing Stage 4 deltas; all authorization,
      // ownership and financial statements still compare byte-for-byte.
      ['import { projectSmsDelivery, SMS_REPORT_SELECT, TENANT_RECEIPT_NOTIFICATION } from "@/lib/smsDeliveryReporting";\n', ''],
      ['      smsNotifications: { where: TENANT_RECEIPT_NOTIFICATION, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: SMS_REPORT_SELECT },\n', ''],
      ['  const smsDelivery = projectSmsDelivery(payment.smsNotifications?.[0], payment.smsReceipt);\n  return { payment, outcome, smsDelivery, accountCode, stripeSessionId };', '  return { payment, outcome, accountCode, stripeSessionId };'],
      ['import { CUSTOMER_REFUND_REPORT_SELECT, loadReportingDisputeOutcome, projectPaymentOutcome } from "@/lib/paymentReportingOutcome";\n', ''],
      ['      customerRefunds: { select: CUSTOMER_REFUND_REPORT_SELECT },\n', ''],
      ['  const outcome = projectPaymentOutcome({ ...payment, disputeOutcome: await loadReportingDisputeOutcome(prisma, payment) });\n  return { payment, outcome, accountCode, stripeSessionId };', '  return { payment, accountCode, stripeSessionId };'],
    ];
    for (const [after, before] of deltas) {
      assert.equal(text.split(after).length - 1, 1, 'Exact approved read-only result reporting delta');
      text = text.replace(after, before);
    }
  }
  if (file === 'lib/stripePaymentWebhook.ts') {
    // Package 2 adds only these exact reporting observations. All ownership,
    // transition, pricing, notification and money-movement code still compares.
    for (const line of [
      '    reportingDisputeOutcome: disputes.some(d => d.status === "lost") ? "LOST" : active.length ? "ACTIVE" : disputes.some(d => d.status === "won") ? "WON" : disputes.length ? "CLOSED" : null,\n',
      '    reportingDisputes: disputes.map(d => ({ id: d.id, status: d.status })),\n',
      '            reportingDisputeOutcome: observed.reportingDisputeOutcome ?? null,\n',
      '            reportingDisputes: observed.reportingDisputes ?? [],\n',
      '      if (observed.reportingDisputes?.length && !payment.disputedAt) data.disputedAt = now;\n',
    ]) {
      assert.equal(text.split(line).length - 1, 1, 'Exact approved dispute reporting delta');
      text = text.replace(line, '');
    }
    const condition = '      if (transition || payment.stripePaymentIntentId !== observed.intentId || payment.stripeChargeId !== observed.chargeId || data.disputedAt) {';
    assert.equal(text.split(condition).length - 1, 1, 'Exact approved first dispute observation persistence');
    text = text.replace(condition, condition.replace(' || data.disputedAt', ''));
  }
  for (const delta of REFUND_SOURCE_DELTAS[file] ?? []) {
    assert.equal(text.split(delta.after).length - 1, 1, 'Exact approved refund delta: ' + file);
    text = text.replace(delta.after, delta.before);
  }
  if (file === 'lib/paymentArchitecturePolicy.ts') {
    // Reverse only known source-controlled OFF decisions and exact delegates.
    // A true/missing/changed decision fails before historical normalization.
    for (const name of ['DIRECT_CHECKOUT_ACTIVATED', 'DIRECT_FINANCIAL_EXECUTION_ACTIVATED']) assert.ok(text.includes(`const ${name} = false;`), name + ' must remain explicitly OFF');
    for (const [name, decision] of [['directQuoteIssuanceEnabled','DIRECT_CHECKOUT_ACTIVATED'],['directReservationEnabled','DIRECT_CHECKOUT_ACTIVATED'],['directFinancialExecutionEnabled','DIRECT_FINANCIAL_EXECUTION_ACTIVATED']]) {
      const declaration = `\n\nexport function ${name}(): boolean {\n  return ${decision};\n}`;
      assert.ok(text.includes(declaration), name + ' must delegate to the closed source decision');
      text = text.replace(declaration, '');
    }
    text = text.replace('// Source-controlled decisions stay OFF pending provider and integration evidence.\n// No runtime configuration is accepted. Financial execution is approved separately.\nconst DIRECT_CHECKOUT_ACTIVATED = false;\nconst DIRECT_FINANCIAL_EXECUTION_ACTIVATED = false;\n\n', '')
      .replace('selectedCheckoutChargeModel(): "LEGACY_DESTINATION" | "DIRECT"', 'selectedCheckoutChargeModel(): "LEGACY_DESTINATION"')
      .replace('return DIRECT_CHECKOUT_ACTIVATED ? "DIRECT" : "LEGACY_DESTINATION";', 'return "LEGACY_DESTINATION";')
      .replace('directPaymentCreationEnabled(): boolean', 'directPaymentCreationEnabled(): false')
      .replace('return DIRECT_CHECKOUT_ACTIVATED;', 'return false;');
  }
  if (file === 'lib/directFinancialObservation.ts') text = text
    .replace(/^export type FinancialSnapshotPayment = Pick<Payment, [^\n]+>;\n/m, '')
    .replace('export function directFinancialSnapshot(p: FinancialSnapshotPayment)', 'export function directFinancialSnapshot(p: Payment)');
  if (file === 'app/api/public/checkout/start/route.ts') text = text
    .replace('import { checkoutDispatchModel, reserveLegacyCheckoutDispatch } from "@/lib/checkoutDispatch";\n', '')
    .replace('  if (checkoutDispatchModel(checkoutSession) !== "LEGACY_DESTINATION") {\n    return NextResponse.json({ error: "Checkout architecture is unavailable.", code: "CHECKOUT_ARCHITECTURE_UNAVAILABLE" }, {\n      status: 409, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },\n    });\n  }\n\n', '')
    .replace('reservation = await reserveLegacyCheckoutDispatch(checkoutSession, () => reserveCheckoutAttempt(', 'reservation = await reserveCheckoutAttempt(')
    .replace('      hasCheckoutQuoteAccess\n    ));', '      hasCheckoutQuoteAccess\n    );');
  if (file === 'lib/directCheckoutLifecycle.ts') text = text
    .replace('import { directPaymentCreationEnabled, directReservationEnabled }', 'import { directPaymentCreationEnabled }')
    .replace('checkoutId: string, report: DirectReadinessReport | null,\n  identity: StripePaymentIdentity, now?: Date)', 'checkoutId: string, report: DirectReadinessReport,\n  identity: StripePaymentIdentity, now?: Date)')
    .replaceAll('    if (!directReservationEnabled()) throw Error("New direct reservations are disabled.");\n', '')
    .replace('    if (!report) throw Error("Fresh direct readiness evidence is required.");\n', '')
    .replace('import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";\n', '')
    .replace('    requireSafe(checkout!.expiresAt > (now ?? new Date()) && await hasCheckoutQuoteAccess(checkoutId));\n', '')
    .replace('    if (checkout!.sourceType === "RECURRING_PLAN") getCheckoutCalendar(business!, evaluatedAt);\n', '')
    .replace('    if (paymentId) {', '    if (checkout!.sourceType === "RECURRING_PLAN") getCheckoutCalendar(business!, evaluatedAt);\n    if (paymentId) {');
  if(file==='app/api/stripe/connect/route.ts')text=text
    .replace('import { logOperationalError } from "@/lib/operationalLogging";\n','')
    .replace('    logOperationalError("stripe_connect_failed", error, session.business.id);','    console.error("Unable to begin Stripe onboarding:", error);');
  if(file==='lib/smsDelivery.ts')text=text.replace('timeout:8000,logLevel:"error"','timeout:8000');
  if (['app/api/public/checkout/start/route.ts','app/api/stripe/connect/route.ts'].includes(file)) text = text
    .replace('import { requireCredentialOrigin } from "@/lib/credentialRequest";\n','')
    .replace('  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }\n','')
    .replace('  if (request.body) return NextResponse.json({ error: "This action does not accept a request body." }, { status: 400 });\n\n','');
  if (file === 'lib/smsDelivery.ts') return text.replace('import { boundedRawBody } from "@/lib/boundedRawBody";\n','').replace('  let raw:string;\n  try { raw=new TextDecoder("utf-8",{fatal:true}).decode(await boundedRawBody(request,16384)); }\n  catch { throw new SmsCallbackInvalid("INVALID_CALLBACK"); }','  const reader=request.body?.getReader();if(!reader)throw new SmsCallbackInvalid("INVALID_CALLBACK");\n  const decoder=new TextDecoder();let raw="",size=0;\n  for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384){await reader.cancel();throw new SmsCallbackInvalid("INVALID_CALLBACK");}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();');
  if (file === 'lib/checkoutRetry.ts') return text
    .replace('resumeAccess: (stripeSessionId: string, checkoutId: string) => Promise<boolean> = async () => false,\n  quoteAccess: (checkoutId: string) => Promise<boolean> = async () => false', 'resumeAccess: (stripeSessionId: string, checkoutId: string) => Promise<boolean> = async () => false')
    .replace('    if (!await quoteAccess(current.id)) return { kind: "block", error: "Checkout authorization unavailable. Please begin again." };\n', '');
  if (file === 'app/api/public/checkout/start/route.ts') return text
    .replace('import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";\n', '')
    .replace('  if (!checkoutSession.paymentId && !checkoutSession.stripeCheckoutSessionId &&\n      !await hasCheckoutQuoteAccess(checkoutSession.id)) {\n    return NextResponse.json({ error: "Checkout authorization unavailable. Please begin again." }, {\n      status: 403, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },\n    });\n  }\n\n', '')
    .replace('      ),\n      hasCheckoutQuoteAccess\n', '      )\n');
  if (file === 'app/[accountCode]/review/page.tsx') text = text
    .replace('import { assertCurrentVersionedReviewQuote } from "@/lib/versionedCheckoutQuote";\n', '')
    .replace('  await reviewStorage(checkoutSession.id, () => assertCurrentVersionedReviewQuote(prisma, checkoutSession, now));\n\n', '')
    .replace('import { logOperationalError } from "@/lib/operationalLogging";\n','')
    .replace("// Only storage calls enter this boundary; Next redirect/notFound exceptions do\n// not. Never pass a raw query error (or its cause) to framework render logging.\nasync function reviewStorage<T>(id: string, operation: () => Promise<T>): Promise<T> {\n  try {\n    return await operation();\n  } catch (error) {\n    logOperationalError(\"checkout_review_failed\", error, id);\n    throw new Error(\"Payment review unavailable. Please try again.\");\n  }\n}\n\n",'')
    .replace('await reviewStorage(checkoutSessionId, () => prisma.checkoutSession.findUnique({','await prisma.checkoutSession.findUnique({')
    .replace('        id: checkoutSessionId,\n      },\n    }));','        id: checkoutSessionId,\n      },\n    });')
    .replace('await reviewStorage(checkoutSession.id, () => prisma.checkoutSession.updateMany({','await prisma.checkoutSession.updateMany({')
    .replace('            CheckoutSessionStatus.EXPIRED,\n        },\n      }));','            CheckoutSessionStatus.EXPIRED,\n        },\n      });');
  if (file === 'app/[accountCode]/review/page.tsx') return text
    .replace('import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";\n', '')
    .replace('  const reserved = Boolean(checkoutSession.paymentId || checkoutSession.stripeCheckoutSessionId);\n  if (!reserved && !await hasCheckoutQuoteAccess(checkoutSession.id)) notFound();\n  if (reserved && (!checkoutSession.paymentId || !checkoutSession.stripeCheckoutSessionId ||\n    !verifyPaymentResultAccessToken(\n      (await getPaymentResultAccessToken(checkoutSession.stripeCheckoutSessionId)) ?? "",\n      checkoutSession.stripeCheckoutSessionId, checkoutSession.id,\n    ))) notFound();\n', '')
    .replace('\n  const now = new Date();', '  if (linkedResume && !verifyPaymentResultAccessToken(\n    (await getPaymentResultAccessToken(checkoutSession.stripeCheckoutSessionId!)) ?? "",\n    checkoutSession.stripeCheckoutSessionId!, checkoutSession.id,\n  )) notFound();\n\n  const now = new Date();');
  return text;
}

// Exact Package 1 additive observation deltas only; every other historical statement still compares.
const REFUND_SOURCE_DELTAS = {
  "prisma/schema.prisma": [
    {
      "after": "  smsNotifications SmsNotification[]\n  financialReconciliation DirectFinancialReconciliation?\n  customerRefunds CustomerRefundObservation[]\n\n  @@index([businessId, createdAt])\n",
      "before": "  smsNotifications SmsNotification[]\n  financialReconciliation DirectFinancialReconciliation?\n\n  @@index([businessId, createdAt])\n"
    },
    {
      "after": "  @@index([businessId, sourceType, sourceId])\n  @@index([status, createdAt])\n}\n\n// Provider observations only: no refund initiation, principal allocation or backfill.\nmodel CustomerRefundObservation {\n  id String @id @default(cuid())\n  paymentId String\n  stripeRefundId String\n  stripePlatformAccountId String\n  stripeAccountId String\n  stripeMode String\n  chargeModel StripeChargeModel?\n  pricingVersion String?\n  stripeChargeId String\n  stripePaymentIntentId String\n  amountCents Int\n  currency String\n  status String\n  stripeCreatedAt DateTime\n  observedAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)\n  @@unique([stripePlatformAccountId, stripeAccountId, stripeMode, stripeRefundId], map: \"CustomerRefund_scope_identity_key\")\n  @@index([paymentId, status])\n}\n\n",
      "before": "  @@index([businessId, sourceType, sourceId])\n  @@index([status, createdAt])\n}\n\n"
    }
  ],
  "lib/stripePaymentWebhook.ts": [
    {
      "after": "import { queuePaymentSms } from \"@/lib/smsNotifications\";\nimport { isCustomerRefundEvent, processCustomerRefundEvent } from \"@/lib/customerRefundObservation\";\nimport { queueDirectReconciliation, queueDirectFinancialEvent, DIRECT_FINANCIAL_EVENTS } from \"@/lib/directFinancialReconciliation\";\nimport { createHash } from \"node:crypto\";\n",
      "before": "import { queuePaymentSms } from \"@/lib/smsNotifications\";\nimport { queueDirectReconciliation, queueDirectFinancialEvent, DIRECT_FINANCIAL_EVENTS } from \"@/lib/directFinancialReconciliation\";\nimport { createHash } from \"node:crypto\";\n"
    },
    {
      "after": "  try {\n    requireOwnership(event.object === \"event\" && typeof event.id === \"string\" && /^evt_[A-Za-z0-9_-]{1,250}$/.test(event.id) && typeof event.type === \"string\" && !!event.data?.object, \"Malformed event\");\n    if (isCustomerRefundEvent(event)) { await processCustomerRefundEvent(prisma, stripe, event); await resolved(event); return; }\n    if (DIRECT_FINANCIAL_EVENTS.has(event.type)) { await queueDirectFinancialEvent(prisma,stripe,event); await resolved(event); return; }\n    const note = notification(event);\n",
      "before": "  try {\n    requireOwnership(event.object === \"event\" && typeof event.id === \"string\" && /^evt_[A-Za-z0-9_-]{1,250}$/.test(event.id) && typeof event.type === \"string\" && !!event.data?.object, \"Malformed event\");\n    if (DIRECT_FINANCIAL_EVENTS.has(event.type)) { await queueDirectFinancialEvent(prisma,stripe,event); await resolved(event); return; }\n    const note = notification(event);\n"
    }
  ],
  "lib/directFinancialReconciliation.ts": [
    {
      "after": "import { randomUUID } from \"node:crypto\";\nimport { assertNoCustomerRefunds, readRefundParent } from \"@/lib/customerRefundObservation\";\nimport { hasUnknownArchitecture } from \"@/lib/paymentArchitectureSnapshot\";\nimport { isDeepStrictEqual } from \"node:util\";\nimport { Prisma, type Payment, type PrismaClient, type DirectFinancialReconciliation } from \"@prisma/client\";\n",
      "before": "import { randomUUID } from \"node:crypto\";\nimport { isDeepStrictEqual } from \"node:util\";\nimport { Prisma, type Payment, type PrismaClient, type DirectFinancialReconciliation } from \"@prisma/client\";\n"
    },
    {
      "after": "    if(p.pricingVersion!==\"RFL_DIRECT_V1\")return {kind:\"DONE\" as const,row};\n    if(row.leaseUntil&&row.leaseUntil>new Date())return {kind:\"BUSY\" as const};\n    try { await assertNoCustomerRefunds(tx, p.id); } catch (error) {\n      if (!(error instanceof FinancialObservationError) || error.code !== \"CUSTOMER_REFUND_REVIEW\") throw error;\n      row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:\"EXCEPTION\",reasonCode:\"CUSTOMER_REFUND_REVIEW\",refreshRequested:false}});\n      return {kind:\"DONE\" as const,row};\n    }\n    // Ownership problems remain durable even when no provider call is possible.\n    try{unchanged(p,row,identity);}catch{row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:\"EXCEPTION\",reasonCode:\"EXPECTED_SNAPSHOT_CHANGED\"}});return {kind:\"DONE\" as const,row};}\n",
      "before": "    if(p.pricingVersion!==\"RFL_DIRECT_V1\")return {kind:\"DONE\" as const,row};\n    if(row.leaseUntil&&row.leaseUntil>new Date())return {kind:\"BUSY\" as const};\n    // Ownership problems remain durable even when no provider call is possible.\n    try{unchanged(p,row,identity);}catch{row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:\"EXCEPTION\",reasonCode:\"EXPECTED_SNAPSHOT_CHANGED\"}});return {kind:\"DONE\" as const,row};}\n"
    },
    {
      "after": "    const fresh=await tx.directFinancialReconciliation.findUnique({where:{id:row.id}});financialCheck(fresh&&fresh.leaseToken===token,\"WORKER_LEASE_LOST\");\n    unchanged(current,fresh,identity);\n    if (data.reservedAt || data.status === \"CORRECTED\" || data.status === \"RECONCILED\") await assertNoCustomerRefunds(tx, p.id);\n    if(data.status===\"CORRECTED\"||data.status===\"RECONCILED\")financialCheck(current.status===\"PAID\"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,\"FINANCIAL_EVENT_REVIEW\");\n    row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{...data,...(finish?{leaseToken:null,leaseUntil:null,...(fresh.refreshRequested?{status:\"WAITING_DATA\",reasonCode:\"DATA_CHANGED_RECHECK_REQUIRED\"}:{})}:{})}});return row;\n",
      "before": "    const fresh=await tx.directFinancialReconciliation.findUnique({where:{id:row.id}});financialCheck(fresh&&fresh.leaseToken===token,\"WORKER_LEASE_LOST\");\n    unchanged(current,fresh,identity);\n    if(data.status===\"CORRECTED\"||data.status===\"RECONCILED\")financialCheck(current.status===\"PAID\"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,\"FINANCIAL_EVENT_REVIEW\");\n    row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{...data,...(finish?{leaseToken:null,leaseUntil:null,...(fresh.refreshRequested?{status:\"WAITING_DATA\",reasonCode:\"DATA_CHANGED_RECHECK_REQUIRED\"}:{})}:{})}});return row;\n"
    },
    {
      "after": "        financialCheck(fresh.correctionCents===row.correctionCents&&fresh.idempotencyKey===row.idempotencyKey&&fresh.applicationFeeId===row.applicationFeeId&&isDeepStrictEqual(fresh.expectedSnapshot,row.expectedSnapshot),\"CORRECTION_RESERVATION_CHANGED\");\n        financialCheck(current.status===\"PAID\"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,\"FINANCIAL_EVENT_REVIEW\");\n        await assertNoCustomerRefunds(tx, p.id);\n        // Necessary last budget read and bounded POST under the Payment lock:\n        // webhook state changes cannot race this execution. Stripe itself also\n",
      "before": "        financialCheck(fresh.correctionCents===row.correctionCents&&fresh.idempotencyKey===row.idempotencyKey&&fresh.applicationFeeId===row.applicationFeeId&&isDeepStrictEqual(fresh.expectedSnapshot,row.expectedSnapshot),\"CORRECTION_RESERVATION_CHANGED\");\n        financialCheck(current.status===\"PAID\"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,\"FINANCIAL_EVENT_REVIEW\");\n        // Necessary last budget read and bounded POST under the Payment lock:\n        // webhook state changes cannot race this execution. Stripe itself also\n"
    },
    {
      "after": "        financialCheck(fee.id===fresh.applicationFeeId&&fee.account===p.stripeConnectedAccountId&&fee.charge===p.stripeChargeId&&fee.livemode===(p.stripeMode===\"live\")&&fee.currency===\"usd\"&&fee.amount===p.rflApplicationFeeCents&&fee.amount_refunded===observation.refundedCents&&fee.amount-fee.amount_refunded>=fresh.correctionCents,\"FEE_BUDGET_CHANGED\");\n        const metadata={rflReconciliationId:fresh.id,rflPaymentId:p.id,rflPlatformAccountId:p.stripePlatformAccountId!,rflConnectedAccountId:p.stripeConnectedAccountId!,rflMode:p.stripeMode!,rflOperation:\"management-net-v1\"};\n        await assertNoCustomerRefunds(tx, p.id);\n        const refund=await stripe.applicationFees.createRefund(fee.id,{amount:fresh.correctionCents,metadata},{...FINANCIAL_READ,idempotencyKey:fresh.idempotencyKey!});\n        financialCheck(refund.object===\"fee_refund\"&&refund.id.startsWith(\"fr_\")&&refund.fee===fee.id&&refund.amount===fresh.correctionCents&&refund.currency===\"usd\"&&Object.entries(metadata).every(([k,v])=>refund.metadata?.[k]===v),\"CORRECTION_RESPONSE_UNVERIFIED\");\n",
      "before": "        financialCheck(fee.id===fresh.applicationFeeId&&fee.account===p.stripeConnectedAccountId&&fee.charge===p.stripeChargeId&&fee.livemode===(p.stripeMode===\"live\")&&fee.currency===\"usd\"&&fee.amount===p.rflApplicationFeeCents&&fee.amount_refunded===observation.refundedCents&&fee.amount-fee.amount_refunded>=fresh.correctionCents,\"FEE_BUDGET_CHANGED\");\n        const metadata={rflReconciliationId:fresh.id,rflPaymentId:p.id,rflPlatformAccountId:p.stripePlatformAccountId!,rflConnectedAccountId:p.stripeConnectedAccountId!,rflMode:p.stripeMode!,rflOperation:\"management-net-v1\"};\n        const refund=await stripe.applicationFees.createRefund(fee.id,{amount:fresh.correctionCents,metadata},{...FINANCIAL_READ,idempotencyKey:fresh.idempotencyKey!});\n        financialCheck(refund.object===\"fee_refund\"&&refund.id.startsWith(\"fr_\")&&refund.fee===fee.id&&refund.amount===fresh.correctionCents&&refund.currency===\"usd\"&&Object.entries(metadata).every(([k,v])=>refund.metadata?.[k]===v),\"CORRECTION_RESPONSE_UNVERIFIED\");\n"
    },
    {
      "after": "\nexport const DIRECT_FINANCIAL_EVENTS = new Set([\"application_fee.created\",\"application_fee.refunded\",\"application_fee.refund.updated\"]);\n/** Authenticated platform fee events only observe/enqueue; never execute corrections.\n * Verified legacy fees are audited separately; unknown ownership stays quarantined. */\nexport async function queueDirectFinancialEvent(db:PrismaClient,stripe:Stripe,event:Stripe.Event) {\n  const object=event.data.object as unknown as {id:string;fee?:string|{id:string}};\n",
      "before": "\nexport const DIRECT_FINANCIAL_EVENTS = new Set([\"application_fee.created\",\"application_fee.refunded\",\"application_fee.refund.updated\"]);\n/** Authenticated platform fee events enqueue only. Correction execution is never\n * performed by a webhook request. Unknown/legacy ownership stays quarantined. */\nexport async function queueDirectFinancialEvent(db:PrismaClient,stripe:Stripe,event:Stripe.Event) {\n  const object=event.data.object as unknown as {id:string;fee?:string|{id:string}};\n"
    },
    {
      "after": "  const fee=await stripe.applicationFees.retrieve(feeId,{},FINANCIAL_READ);\n  const chargeId=typeof fee.charge===\"string\"?fee.charge:fee.charge.id;\n  const byCharge=await db.payment.findUnique({where:{stripeChargeId:chargeId}});\n  const originalId=typeof fee.originating_transaction===\"string\"?fee.originating_transaction:fee.originating_transaction?.id;\n  const byOriginal=originalId?await db.payment.findUnique({where:{stripeChargeId:originalId}}):null;\n  financialCheck(!byCharge||!byOriginal||byCharge.id===byOriginal.id,\"FINANCIAL_EVENT_OWNERSHIP_MISMATCH\");\n  const p=byCharge??byOriginal;\n  if(p&&(p.chargeModel===\"LEGACY_DESTINATION\"||hasUnknownArchitecture(p))){\n    const parent=await readRefundParent(db,stripe,p,event,p.stripeChargeId!);\n    const destination=typeof parent.intent.transfer_data?.destination===\"string\"?parent.intent.transfer_data.destination:parent.intent.transfer_data?.destination?.id;\n    const feeAccount=typeof fee.account===\"string\"?fee.account:fee.account.id;\n    const chargeFee=typeof parent.charge.application_fee===\"string\"?parent.charge.application_fee:parent.charge.application_fee?.id;\n    financialCheck(fee.id===feeId&&fee.livemode===event.livemode&&fee.currency===\"usd\"&&fee.amount===p.platformFeeCents&&\n      Number.isSafeInteger(fee.amount_refunded)&&fee.amount_refunded>=0&&fee.amount_refunded<=fee.amount&&\n      feeAccount===destination&&chargeFee===fee.id&&(chargeId===p.stripeChargeId||originalId===p.stripeChargeId),\"FINANCIAL_EVENT_OWNERSHIP_MISMATCH\");\n    await locked(db,p.id,async(tx,current)=>{\n      financialCheck(isDeepStrictEqual(directFinancialSnapshot(current),directFinancialSnapshot(p)),\"EXPECTED_SNAPSHOT_CHANGED\");\n      const where={actorType:\"STRIPE_WEBHOOK\",targetType:\"PAYMENT\",targetId:p.id,metadata:{path:[\"stripeEventId\"],equals:event.id}};\n      if(await tx.auditLog.findFirst({where}))return;\n      await tx.auditLog.create({data:{id:\"stripe-financial-event-\"+event.id,businessId:p.businessId,actorType:\"STRIPE_WEBHOOK\",action:\"LEGACY_APPLICATION_FEE_OBSERVED\",targetType:\"PAYMENT\",targetId:p.id,\n        metadata:{stripeEventId:event.id,stripeEventType:event.type,applicationFeeId:fee.id,amountCents:fee.amount,refundedCents:fee.amount_refunded,stripeMode:parent.identity.mode}}});\n    });\n    return;\n  }\n  financialCheck(p&&p.chargeModel===\"DIRECT\"&&p.pricingVersion===\"RFL_DIRECT_V1\",\"FINANCIAL_EVENT_OWNERSHIP_MISMATCH\");\n  const mode=classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY??\"\");financialCheck((mode===\"live\"||mode===\"test\")&&event.livemode===(mode===\"live\")&&fee.livemode===event.livemode,\"MODE_MISMATCH\");\n  const identity={platformAccountId:p.stripePlatformAccountId!,mode};resolveStripePaymentContext(p,identity);\n",
      "before": "  const fee=await stripe.applicationFees.retrieve(feeId,{},FINANCIAL_READ);\n  const chargeId=typeof fee.charge===\"string\"?fee.charge:fee.charge.id;\n  const p=await db.payment.findUnique({where:{stripeChargeId:chargeId}});financialCheck(p&&p.chargeModel===\"DIRECT\"&&p.pricingVersion===\"RFL_DIRECT_V1\",\"FINANCIAL_EVENT_OWNERSHIP_MISMATCH\");\n  const mode=classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY??\"\");financialCheck((mode===\"live\"||mode===\"test\")&&event.livemode===(mode===\"live\")&&fee.livemode===event.livemode,\"MODE_MISMATCH\");\n  const identity={platformAccountId:p.stripePlatformAccountId!,mode};resolveStripePaymentContext(p,identity);\n"
    }
  ]
};

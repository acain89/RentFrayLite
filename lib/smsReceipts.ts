import {
  PaymentStatus,
  SmsReceiptStatus,
} from "@prisma/client";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";

export type SmsDispatchResult =
  | {
      status: "SENT";
      receiptId: string;
      providerMessageId: string;
    }
  | {
      status: "SKIPPED";
      receiptId: string;
      reason: string;
    }
  | {
      status: "FAILED";
      receiptId: string;
      reason: string;
    };

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function buildReceiptMessage(input: {
  businessName: string;
  payerFirstName: string;
  payerLastName: string;
  totalChargedCents: number;
  itemDescription: string;
  referenceLabel: string | null;
}): string {
  const referenceText = input.referenceLabel
    ? ` Reference: ${input.referenceLabel}.`
    : "";

  return [
    `${input.businessName} payment receipt:`,
    `${formatMoney(input.totalChargedCents)} received from`,
    `${input.payerFirstName} ${input.payerLastName}`,
    `for ${input.itemDescription}.`,
    `${referenceText}`,
    "Payment confirmed. Thank you.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTwilioClient() {
  const accountSid = requireEnvironmentVariable(
    "TWILIO_ACCOUNT_SID"
  );
  const authToken = requireEnvironmentVariable(
    "TWILIO_AUTH_TOKEN"
  );

  return twilio(accountSid, authToken, {
    autoRetry: true,
    maxRetries: 3,
  });
}

function getFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }

  return "Unknown SMS delivery error.";
}

export async function dispatchSmsReceipt(
  receiptId: string
): Promise<SmsDispatchResult> {
  const claimResult = await prisma.smsReceipt.updateMany({
    where: {
      id: receiptId,
      status: SmsReceiptStatus.QUEUED,
    },
    data: {
      status: SmsReceiptStatus.SENDING,
      failureMessage: null,
    },
  });

  if (claimResult.count !== 1) {
    return {
      status: "SKIPPED",
      receiptId,
      reason:
        "Receipt was not queued or another worker already claimed it.",
    };
  }

  try {
    const receipt = await prisma.smsReceipt.findUnique({
      where: {
        id: receiptId,
      },
      include: {
        payment: {
          include: {
            business: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new Error(
        "The claimed SMS receipt no longer exists."
      );
    }

    if (receipt.payment.status !== PaymentStatus.PAID) {
      throw new Error(
        `Payment is ${receipt.payment.status}, not PAID.`
      );
    }

    const fromPhone = requireEnvironmentVariable(
      "TWILIO_PHONE_NUMBER"
    );

    const client = getTwilioClient();

    const message = await client.messages.create({
      to: receipt.phone,
      from: fromPhone,
      body: buildReceiptMessage({
        businessName: receipt.payment.business.name,
        payerFirstName:
          receipt.payment.payerFirstName,
        payerLastName:
          receipt.payment.payerLastName,
        totalChargedCents:
          receipt.payment.totalChargedCents,
        itemDescription:
          receipt.payment.itemDescription,
        referenceLabel:
          receipt.payment.referenceLabel,
      }),
    });

    await prisma.smsReceipt.update({
      where: {
        id: receipt.id,
      },
      data: {
        status: SmsReceiptStatus.SENT,
        providerMessageId: message.sid,
        failureMessage: null,
        sentAt: new Date(),
      },
    });

    return {
      status: "SENT",
      receiptId: receipt.id,
      providerMessageId: message.sid,
    };
  } catch (error) {
    const failureMessage = getFailureMessage(error);

    await prisma.smsReceipt.updateMany({
      where: {
        id: receiptId,
        status: SmsReceiptStatus.SENDING,
      },
      data: {
        status: SmsReceiptStatus.FAILED,
        failureMessage,
      },
    });

    return {
      status: "FAILED",
      receiptId,
      reason: failureMessage,
    };
  }
}

export async function processQueuedSmsReceipts(
  limit = 20
): Promise<SmsDispatchResult[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const queuedReceipts = await prisma.smsReceipt.findMany({
    where: {
      status: SmsReceiptStatus.QUEUED,
      payment: {
        status: PaymentStatus.PAID,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: safeLimit,
  });

  const results: SmsDispatchResult[] = [];

  for (const receipt of queuedReceipts) {
    results.push(
      await dispatchSmsReceipt(receipt.id)
    );
  }

  return results;
}
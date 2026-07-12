type LateFeePreviewInput = {
  balanceCents: number;
  isDelinquent: boolean;
  settings: {
    lateFeeType: "FLAT" | "PERCENT";
    lateFeeFlatCents?: number | null;
    lateFeePercentBps?: number | null; // basis points (100 = 1%)
  };
};

type LateFeePreviewResult = {
  recommendedLateFeeCents: number;
  eligible: boolean;
  reason: string;
  basedOnBalanceCents: number;
  evaluatedAt: Date;
};

function toSafeCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export function getLateFeePreview(
  input: LateFeePreviewInput
): LateFeePreviewResult {
  const balanceCents = toSafeCents(input.balanceCents);

  if (!input.isDelinquent || balanceCents <= 0) {
    return {
      recommendedLateFeeCents: 0,
      eligible: false,
      reason: "Not delinquent",
      basedOnBalanceCents: balanceCents,
      evaluatedAt: new Date(),
    };
  }

  let feeCents = 0;

  if (input.settings.lateFeeType === "PERCENT") {
    const bps = toSafeCents(input.settings.lateFeePercentBps ?? 0);
    feeCents = Math.trunc((balanceCents * bps) / 10_000);
  } else {
    feeCents = toSafeCents(input.settings.lateFeeFlatCents ?? 0);
  }

  return {
    recommendedLateFeeCents: feeCents,
    eligible: feeCents > 0,
    reason: "Past grace period with outstanding balance",
    basedOnBalanceCents: balanceCents,
    evaluatedAt: new Date(),
  };
}
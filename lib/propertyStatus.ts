// lib/propertyStatus.ts

type AutoReadyArgs = {
  currentStatus?: string | null;
  isActive?: boolean | null;
  hasSettings: boolean;
  unitsCount: number;
  processorConnected?: boolean | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
};

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function shouldAutoSetPropertyReady(args: AutoReadyArgs): boolean {
  const currentStatus = normalizeStatus(args.currentStatus);

  if (currentStatus !== "SETUP") return false;
  if (args.isActive === false) return false;

  return (
    args.hasSettings &&
    args.unitsCount > 0 &&
    Boolean(args.processorConnected) &&
    Boolean(args.chargesEnabled) &&
    Boolean(args.payoutsEnabled)
  );
}
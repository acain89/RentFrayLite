// lib/qr.ts

export function buildPropertyLink(propertyCode: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || "https://rentfray.com";

  return `${base}/property-code?code=${propertyCode}`;
}

export function buildQRCodeUrl(propertyCode: string) {
  const link = buildPropertyLink(propertyCode);

  // Uses a simple public QR generator (can swap later)
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    link
  )}`;
}
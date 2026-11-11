// Product-owner-confirmed launch origin. Request headers and local/test
// environment values must never become published search metadata.
export const RFL_PUBLIC_ORIGIN = "https://rentfraylite.com";

// Existing public pages only. New pages require an explicit indexing decision.
export const PUBLIC_MARKETING_PATHS = [
  "/", "/contact", "/support", "/security", "/privacy", "/terms",
] as const;

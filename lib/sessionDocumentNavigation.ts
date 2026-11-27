/** Credential changes must discard the previous identity's document and memory. */
export function navigateSessionDocument(path: string): void {
  const target = new URL(path, window.location.origin);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || target.origin !== window.location.origin) throw Error("Invalid session navigation destination");
  window.location.assign(target.href);
}

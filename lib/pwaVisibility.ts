/** Exact application routes only; never infer eligibility from a prefix. */
export const INSTALLATION_ROUTES: readonly string[] = ["/", "/manager/dashboard", "/admin"];
export function isInstallationRoute(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && INSTALLATION_ROUTES.includes(pathname);
}

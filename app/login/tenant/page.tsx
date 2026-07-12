// app/login/tenant/page.tsx

import TenantLoginClient from "./TenantLoginClient";

type TenantLoginPageProps = {
  searchParams: Promise<{
    code?: string | string[] | undefined;
  }>;
};

export default async function TenantLoginPage({
  searchParams,
}: TenantLoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawCode = resolvedSearchParams?.code;

  const propertyCode = Array.isArray(rawCode)
    ? rawCode[0] ?? ""
    : rawCode ?? "";

  return (
    <TenantLoginClient
      propertyCode={propertyCode || ""}
      key={propertyCode}
    />
  );
}
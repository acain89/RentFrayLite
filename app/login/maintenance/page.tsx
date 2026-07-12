// app/login/maintenance/page.tsx

import MaintenanceLoginClient from "./MaintenanceLoginClient";

type MaintenanceLoginPageProps = {
  searchParams: Promise<{
    code?: string | string[];
  }>;
};

export default async function MaintenanceLoginPage({
  searchParams,
}: MaintenanceLoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawCode = resolvedSearchParams?.code;
  const propertyCode = Array.isArray(rawCode) ? rawCode[0] ?? "" : rawCode ?? "";

  return (
    <MaintenanceLoginClient
      propertyCode={propertyCode || ""}
      key={propertyCode}
    />
  );
}
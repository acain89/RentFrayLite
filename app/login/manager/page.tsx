// app/login/manager/page.tsx

import ManagerLoginClient from "./ManagerLoginClient";

type ManagerLoginPageProps = {
  searchParams: Promise<{
    code?: string | string[] | undefined;
  }>;
};

export default async function ManagerLoginPage({
  searchParams,
}: ManagerLoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawCode = resolvedSearchParams?.code;
  const propertyCode = Array.isArray(rawCode) ? rawCode[0] ?? "" : rawCode ?? "";

  return (
    <ManagerLoginClient
      propertyCode={propertyCode || ""}
      key={propertyCode}
    />
  );
}
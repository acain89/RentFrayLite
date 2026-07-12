import TenantActivateClient from "./TenantActivateClient";

export default async function TenantActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const propertyCode = params?.code || "";

  return <TenantActivateClient propertyCode={propertyCode} />;
}
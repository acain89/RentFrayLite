import { prisma } from "@/lib/prisma";

function fmtDate(value: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US");
}

export default async function UnitHistory({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      property: true,
      assignments: {
        orderBy: { moveIn: "desc" },
        include: {
          tenant: true,
        },
      },
    },
  });

  if (!unit) {
    return <div>Unit not found</div>;
  }

  type AssignmentWithTenant = (typeof unit.assignments)[number];

  const current = unit.assignments.find(
    (a: AssignmentWithTenant) => !a.moveOut
  );
  const history = unit.assignments.filter(
    (a: AssignmentWithTenant) => !!a.moveOut
  );

  return (
    <div style={{ padding: 24 }}>
      <h1>Unit History</h1>

      <div style={{ marginBottom: 20 }}>
        <strong>Property:</strong> {unit.property.name}
        <br />
        <strong>Unit:</strong> {unit.name}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2>Current Tenant</h2>

        {!current && <div>Vacant</div>}

        {current && (
          <div
            style={{
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 6,
              marginTop: 8,
            }}
          >
            <div>
              <strong>{current.tenant.name}</strong>
            </div>
            <div>Move-in: {fmtDate(current.moveIn)}</div>
            <div>Status: Active</div>
          </div>
        )}
      </div>

      <div>
        <h2>Previous Tenants</h2>

        {history.length === 0 && <div>No history</div>}

        {history.map((a: AssignmentWithTenant) => (
          <div
            key={a.id}
            style={{
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 6,
              marginTop: 8,
            }}
          >
            <div>
              <strong>{a.tenant.name}</strong>
            </div>
            <div>Move-in: {fmtDate(a.moveIn)}</div>
            <div>Move-out: {fmtDate(a.moveOut)}</div>
            <div>Status: Past</div>
          </div>
        ))}
      </div>
    </div>
  );
}
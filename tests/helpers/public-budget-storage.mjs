// Storage adapter only: production normalization, clock/window decisions,
// locking, reservations and response behavior are never mocked.
export function attachPublicBudgetStorage(db, now = () => new Date()) {
  const rows = new Map();
  db.publicRequestBudget = {
    async findUnique({ where }) { return structuredClone(rows.get(where.key) ?? null); },
    async findMany({ where, take }) {
      return [...rows.values()].filter(row => row.key.startsWith(where.key.startsWith) && row.expiresAt <= where.expiresAt.lte).sort((a,b)=>a.expiresAt-b.expiresAt).slice(0,take).map(row=>({key:row.key}));
    },
    async deleteMany({ where }) { let count=0; for(const key of where.key.in) if(rows.delete(key))count++; return {count}; },
    async upsert({ where, create, update }) { const row=rows.has(where.key)?{...rows.get(where.key),...update}:create; rows.set(where.key,structuredClone(row)); return structuredClone(row); },
  };
  const query = db.$queryRaw?.bind(db);
  db.$queryRaw = async statement => /clock_timestamp/.test(statement.sql) ? [{ now: now() }] : query(statement);
  return rows;
}

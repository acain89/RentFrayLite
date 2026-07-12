// lib/rateLimit.ts

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000
) {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now > existing.resetAt) {
    const next: Entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, next);

    return {
      ok: true,
      remaining: limit - 1,
      resetAt: next.resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    ok: true,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt,
  };
}

export function clearRateLimit(key: string) {
  store.delete(key);
}
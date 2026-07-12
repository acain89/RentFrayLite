// lib/pinLockout.ts

type Entry = {
  attempts: number;
  lockedUntil: number | null;
};

const store = new Map<string, Entry>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

export function checkPinAllowed(key: string) {
  const entry = store.get(key);

  if (!entry) {
    return { ok: true };
  }

  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return {
      ok: false,
      locked: true,
      remainingMs: entry.lockedUntil - Date.now(),
    };
  }

  return { ok: true };
}

export function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = store.get(key) || {
    attempts: 0,
    lockedUntil: null,
  };

  entry.attempts += 1;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.attempts = 0;
  }

  store.set(key, entry);

  return entry;
}

export function clearPinAttempts(key: string) {
  store.delete(key);
}
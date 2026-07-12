// lib/realtime.ts

export type RealtimeEvent =
  | "ledger:update"
  | "tenant:update"
  | "unit:update"
  | "payment:update"
  | "maintenance:update"
  | "admin:update"
  | "admin:notes:update";

export type RealtimePayload = {
  type: RealtimeEvent;
  version: 1;
  timestamp: number;
  data?: unknown;
};

type Client = {
  id: string;
  send: (event: RealtimePayload) => void;
};

const clients = new Map<string, Client>();

function createId(): string {
  return Math.random().toString(36).slice(2);
}

export function subscribe(send: (event: RealtimePayload) => void) {
  const id = createId();

  const client: Client = {
    id,
    send,
  };

  clients.set(id, client);

  return () => {
    clients.delete(id);
  };
}

export function emitEvent(type: RealtimeEvent, data?: unknown): void {
  const payload: RealtimePayload = {
    type,
    version: 1,
    timestamp: Date.now(),
    data,
  };

  for (const client of clients.values()) {
    try {
      client.send(payload);
    } catch {
      // ignore broken client
    }
  }
}
/** Read public JSON with a byte limit enforced before decoding or parsing. */
export class PublicJsonError extends Error {
  constructor(readonly status: 400 | 413 | 415) { super("Invalid request body."); }
}

export async function publicJson(request: Request, maximumBytes: number): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new PublicJsonError(415);
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new PublicJsonError(400);
  if (length !== null && Number(length) > maximumBytes) throw new PublicJsonError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicJsonError(400);
  const chunks: Uint8Array[] = [];
  let size = 0, reads = 0;
  const deadline = Date.now() + 10_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PublicJsonError(400)), 10_000);
  });
  try {
    for (;;) {
      if (Date.now() >= deadline) throw new PublicJsonError(400);
      // Also bound stream bookkeeping, including pathological empty chunks.
      if (++reads > maximumBytes + 1) throw new PublicJsonError(400);
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBytes) {
        void reader.cancel().catch(() => {});
        throw new PublicJsonError(413);
      }
      if (part.value.byteLength) chunks.push(part.value);
    }
    if (length !== null && Number(length) !== size) throw new PublicJsonError(400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new PublicJsonError(400);
    return data as Record<string, unknown>;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof PublicJsonError) throw error;
    throw new PublicJsonError(400);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export function publicJsonFailure(error: unknown) {
  const status = error instanceof PublicJsonError ? error.status : 400;
  return Response.json({ error: status === 413 ? "Request body is too large." : status === 415 ? "Use application/json." : "Invalid request body." }, { status });
}

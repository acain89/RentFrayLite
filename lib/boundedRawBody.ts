/** Bounded raw bytes: never decode/re-encode a signed provider payload. */
export class BoundedBodyError extends Error {
  constructor(readonly status: 400 | 413) { super("Invalid request body."); }
}

export async function boundedRawBody(request: Request, maximumBytes: number): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new BoundedBodyError(400);
  if (length !== null && Number(length) > maximumBytes) {
    void request.body?.cancel().catch(() => {});
    throw new BoundedBodyError(413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new BoundedBodyError(400);
  const bytes = Buffer.allocUnsafe(maximumBytes);
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BoundedBodyError(400)), 10_000);
  });
  try {
    for (let reads = 0; ; reads++) {
      if (reads > maximumBytes) throw new BoundedBodyError(400);
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      if (size + part.value.byteLength > maximumBytes) throw new BoundedBodyError(413);
      bytes.set(part.value, size);
      size += part.value.byteLength;
    }
    if (length !== null && Number(length) !== size) throw new BoundedBodyError(400);
    return bytes.subarray(0, size);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof BoundedBodyError) throw error;
    throw new BoundedBodyError(400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

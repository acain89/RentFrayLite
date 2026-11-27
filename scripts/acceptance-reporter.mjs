// Machine-readable final coverage; intentionally excludes request bodies/errors.
export default async function* acceptanceReporter(source) {
  for await (const event of source) {
    if (!["test:pass", "test:fail", "test:summary"].includes(event.type)) continue;
    const data = event.data;
    yield JSON.stringify({ event: event.type, name: data.name, file: data.file, line: data.line, nesting: data.nesting,
      skipped: data.skip ?? false, durationMs: data.details?.duration_ms, summary: event.type === "test:summary" ? data : undefined }) + "\n";
  }
}

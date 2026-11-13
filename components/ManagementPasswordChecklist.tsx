import { managementPasswordChecks } from "@/lib/managementPasswordPolicy";

export default function ManagementPasswordChecklist({ password, id, concise = false }: { password: string; id: string; concise?: boolean }) {
  const checks = managementPasswordChecks(password);
  const items = [
    [concise ? "8 characters minimum" : "At least 8 characters (excluding outer spaces)", checks.minimumLength],
    [concise ? "One uppercase letter" : "One uppercase letter (A-Z)", checks.uppercase],
    [concise ? "One lowercase letter" : "One lowercase letter (a-z)", checks.lowercase],
    [concise ? "One number" : "One digit (0-9)", checks.digit],
  ] as const;
  return <div id={id} aria-live="polite" aria-atomic="true">
    <ul aria-label="Password requirements">{items.map(([label, met]) =>
      <li key={label} data-met={met} aria-label={`${met ? "Met" : "Not met"}: ${label}`}>
        <span aria-hidden="true">{met ? "✓" : "○"}</span> {label}
      </li>)}</ul>
    {!concise && <p>Special characters are optional. Maximum 72 UTF-8 bytes.</p>}
    {!checks.safeEncoding && <p role="alert">{concise ? "Password is too long or contains unsupported characters." : "Use valid Unicode without NUL, within the 72-byte limit."}</p>}
  </div>;
}

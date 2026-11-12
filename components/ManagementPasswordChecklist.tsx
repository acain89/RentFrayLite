import { managementPasswordChecks } from "@/lib/managementPasswordPolicy";

export default function ManagementPasswordChecklist({ password, id }: { password: string; id: string }) {
  const checks = managementPasswordChecks(password);
  const items = [
    ["At least 8 characters (excluding outer spaces)", checks.minimumLength],
    ["One uppercase letter (A-Z)", checks.uppercase],
    ["One lowercase letter (a-z)", checks.lowercase],
    ["One digit (0-9)", checks.digit],
  ] as const;
  return <div id={id} aria-live="polite" aria-atomic="true">
    <ul aria-label="Password requirements">{items.map(([label, met]) =>
      <li key={label} data-met={met} aria-label={`${met ? "Met" : "Not met"}: ${label}`}>
        <span aria-hidden="true">{met ? "✓" : "○"}</span> {label}
      </li>)}</ul>
    <p>Special characters are optional. Maximum 72 UTF-8 bytes.</p>
    {!checks.safeEncoding && <p>Use valid Unicode without NUL, within the 72-byte limit.</p>}
  </div>;
}

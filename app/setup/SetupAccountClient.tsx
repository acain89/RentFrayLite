"use client";

import Link from "next/link";
import ManagementPasswordChecklist from "@/components/ManagementPasswordChecklist";
import { isNewManagementPassword, MANAGEMENT_PASSWORD_MIN_LENGTH } from "@/lib/managementPasswordPolicy";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_TIME_ZONE_OPTIONS } from "@/lib/managementBillingSetup";

import { formatRegistrationPhone, normalizeRegistrationPhone, REGISTRATION_PHONE_INVALID, REGISTRATION_SMS_PHONE_REQUIRED } from "@/lib/registrationPhone";

type SetupResponse = {
  redirectTo?: string;
  error?: string;
};

export default function SetupAccountClient() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setError("");
    setPhoneError("");
    const contactPhone = normalizeRegistrationPhone(formData.get("contactPhone"));
    if (smsConsent && !contactPhone) { setPhoneError(REGISTRATION_SMS_PHONE_REQUIRED); return; }
    if (phone.trim() && !contactPhone) { setPhoneError(REGISTRATION_PHONE_INVALID); return; }
    if (!isNewManagementPassword(formData.get("password"))) { setError("Use at least 8 characters with an uppercase letter, a lowercase letter and a number. Avoid unsupported characters or an overly long password."); return; }
    setSubmitting(true);

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessName: formData.get("businessName"),
          ownerName: formData.get("ownerName"),
          email: formData.get("email"),
          contactPhone: contactPhone ?? undefined,
          smsConsent,
          propertyTimeZone: formData.get("propertyTimeZone"),
          password: formData.get("password"),
          confirmPassword: formData.get("confirmPassword"),
          acceptedTerms: formData.get("acceptedTerms") === "yes",
        }),
      });

      const data = (await response.json()) as SetupResponse;

      if (!response.ok || !data.redirectTo) {
        setError(data.error ?? "Unable to create the account.");
        return;
      }

      router.replace(data.redirectTo);
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card rfl-registration-card">
        <Link className="rfl-auth-home-link" href="/">
          RentFrayLite
        </Link>

        <header className="rfl-setup-header">
          <p className="rfl-eyebrow">Step 1 of 4</p>
          <h1>Create your account</h1>
        </header>

        <form className="rfl-setup-form" onSubmit={handleSubmit}>
          <div className="rfl-field">
            <label htmlFor="businessName">Business Name</label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              autoComplete="organization"
              required
              maxLength={120}
            />
          </div>

          <div className="rfl-field">
            <label htmlFor="ownerName">Your name</label>
            <input
              id="ownerName"
              name="ownerName"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
            />
          </div>

          <div className="rfl-setup-grid">
            <div className="rfl-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </div>

            <div className="rfl-field">
              <label htmlFor="contactPhone">
                Cell Phone Number
                <span> Optional</span>
              </label>
              <input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                autoComplete="tel-national"
                inputMode="tel"
                placeholder="XXX-XXX-XXXX"
                value={phone}
                onChange={event => {
                  const value = formatRegistrationPhone(event.target.value);
                  setPhone(value);
                  setPhoneError(smsConsent && !normalizeRegistrationPhone(value) ? REGISTRATION_SMS_PHONE_REQUIRED : "");
                }}
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? "registration-phone-error" : undefined}
                maxLength={30}
              />
              {phoneError ? <p id="registration-phone-error" className="rfl-error" role="alert">{phoneError}</p> : null}
            </div>
          </div>

          <div className="rfl-field">
            <label className="rfl-legal-acceptance">
              <input type="checkbox" name="smsConsent" value="yes" checked={smsConsent}
                onChange={event => {
                  setSmsConsent(event.target.checked);
                  setPhoneError(event.target.checked && !normalizeRegistrationPhone(phone) ? REGISTRATION_SMS_PHONE_REQUIRED : "");
                }}
                aria-describedby="registration-sms-disclosure" />
              <span>Send me RentFrayLite payment updates by text (optional).</span>
            </label>
            <p id="registration-sms-disclosure" className="rfl-field-help">
              Automated texts. Frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help. Consent isn&apos;t required to sign up.
              {" "}<Link href="/terms" target="_blank">SMS Terms</Link>{" \u00b7 "}<Link href="/privacy" target="_blank">Privacy</Link>
            </p>
          </div>

          <div className="rfl-field rfl-registration-timezone">
            <label htmlFor="propertyTimeZone">Property timezone</label>
            <select id="propertyTimeZone" name="propertyTimeZone" defaultValue="America/Chicago" required>
              {PROPERTY_TIME_ZONE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label} ({option.value})</option>
              ))}
            </select>
            <p className="rfl-field-help">Select the time zone the property is located in.</p>
          </div>

          <div className="rfl-setup-grid">
            <div className="rfl-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                aria-describedby="registration-password-rules"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                minLength={MANAGEMENT_PASSWORD_MIN_LENGTH}
                maxLength={72}
                required
              />
              <ManagementPasswordChecklist password={password} id="registration-password-rules" concise />
            </div>

            <div className="rfl-field">
              <label htmlFor="confirmPassword">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                minLength={MANAGEMENT_PASSWORD_MIN_LENGTH}
                maxLength={72}
                required
              />
            </div>
          </div>

          <label className="rfl-password-toggle">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => {
                setShowPasswords(event.target.checked);
              }}
            />
            <span>Show passwords</span>
          </label>

          <label className="rfl-legal-acceptance">
            <input
              name="acceptedTerms"
              type="checkbox"
              value="yes"
              required
            />
            <span>
              I have read and agree to the{" "}
              <Link href="/terms" target="_blank">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {error ? (
            <p className="rfl-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="rfl-primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating account..." : "Continue"}
          </button>
        </form>

        <Link className="rfl-auth-secondary-link" href="/login/manager">
          Already have an account? Sign in
        </Link>
      </section>
    </main>
  );
}

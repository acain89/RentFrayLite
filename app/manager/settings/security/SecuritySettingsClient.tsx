"use client";

import { FormEvent, useState } from "react";

type SecurityResponse = {
  success?: boolean;
  email?: string;
  message?: string;
  error?: string;
};

export default function SecuritySettingsClient({
  currentEmail,
}: {
  currentEmail: string;
}) {
  const [displayEmail, setDisplayEmail] = useState(currentEmail);

  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [passwordCurrentPassword, setPasswordCurrentPassword] =
    useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);

  async function updateEmail(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setEmailMessage("");
    setSavingEmail(true);

    try {
      const response = await fetch("/api/manager/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "EMAIL",
          currentPassword: emailCurrentPassword,
          newEmail,
        }),
      });

      const data = (await response.json()) as SecurityResponse;

      if (!response.ok) {
        setEmailMessage(data.error ?? "Unable to update the email.");
        return;
      }

      const updatedEmail = data.email ?? newEmail.trim().toLowerCase();

      setDisplayEmail(updatedEmail);
      setNewEmail("");
      setEmailCurrentPassword("");
      setEmailMessage(data.message ?? "Login email updated.");
    } catch {
      setEmailMessage("Unable to update the email.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function updatePassword(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage("The new passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      const response = await fetch("/api/manager/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "PASSWORD",
          currentPassword: passwordCurrentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await response.json()) as SecurityResponse;

      if (!response.ok) {
        setPasswordMessage(
          data.error ?? "Unable to update the password."
        );
        return;
      }

      setPasswordCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(data.message ?? "Password updated.");
    } catch {
      setPasswordMessage("Unable to update the password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="rfl-security-layout">
      <section className="rfl-security-card">
        <div className="rfl-security-heading">
          <h2>Login Email</h2>
          <p>
            Current login email: <strong>{displayEmail}</strong>
          </p>
        </div>

        <form className="rfl-security-form" onSubmit={updateEmail}>
          <label htmlFor="security-new-email">New email</label>
          <input
            id="security-new-email"
            type="email"
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value);
              setEmailMessage("");
            }}
            required
          />

          <label htmlFor="security-email-current-password">
            Current password
          </label>
          <input
            id="security-email-current-password"
            type={showEmailPassword ? "text" : "password"}
            value={emailCurrentPassword}
            onChange={(event) => {
              setEmailCurrentPassword(event.target.value);
              setEmailMessage("");
            }}
            minLength={6}
            maxLength={128}
            required
          />

          <label className="rfl-password-toggle">
            <input
              type="checkbox"
              checked={showEmailPassword}
              onChange={(event) => {
                setShowEmailPassword(event.target.checked);
              }}
            />
            <span>Show password</span>
          </label>

          {emailMessage ? (
            <p className="rfl-security-message" role="status">
              {emailMessage}
            </p>
          ) : null}

          <button
            className="rfl-primary-button"
            type="submit"
            disabled={savingEmail}
          >
            {savingEmail ? "Saving..." : "Update Email"}
          </button>
        </form>
      </section>

      <section className="rfl-security-card">
        <div className="rfl-security-heading">
          <h2>Password</h2>
          <p>Passwords must contain at least 6 characters.</p>
        </div>

        <form className="rfl-security-form" onSubmit={updatePassword}>
          <label htmlFor="security-password-current">
            Current password
          </label>
          <input
            id="security-password-current"
            type={showNewPasswords ? "text" : "password"}
            value={passwordCurrentPassword}
            onChange={(event) => {
              setPasswordCurrentPassword(event.target.value);
              setPasswordMessage("");
            }}
            minLength={6}
            maxLength={128}
            required
          />

          <label htmlFor="security-password-new">New password</label>
          <input
            id="security-password-new"
            type={showNewPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPasswordMessage("");
            }}
            minLength={6}
            maxLength={128}
            required
          />

          <label htmlFor="security-password-confirm">
            Confirm new password
          </label>
          <input
            id="security-password-confirm"
            type={showNewPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPasswordMessage("");
            }}
            minLength={6}
            maxLength={128}
            required
          />

          <label className="rfl-password-toggle">
            <input
              type="checkbox"
              checked={showNewPasswords}
              onChange={(event) => {
                setShowNewPasswords(event.target.checked);
              }}
            />
            <span>Show passwords</span>
          </label>

          {passwordMessage ? (
            <p className="rfl-security-message" role="status">
              {passwordMessage}
            </p>
          ) : null}

          <button
            className="rfl-primary-button"
            type="submit"
            disabled={savingPassword}
          >
            {savingPassword ? "Saving..." : "Update Password"}
          </button>
        </form>
      </section>
    </div>
  );
}
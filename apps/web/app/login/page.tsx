"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../lib/auth-context";

function SessionExpiredNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  if (reason === "session_expired") {
    return (
      <div className="info-alert" role="status">
        <strong>Session Notice</strong>
        Your session has expired or was revoked. Please sign in below to continue.
      </div>
    );
  }
  return null;
}

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    if (!email || !password) {
      setLocalError("Please enter your email and password.");
      return;
    }
    try {
      await login(email, password);
    } catch (err: any) {
      setLocalError(err?.message || "Login failed. Check your credentials.");
    }
  };

  const displayError = localError || error;

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/" className="brand">
          <span className="brand-mark">◉</span>TrustLedger
        </Link>
        <div className="login-brand-copy">
          <p className="kicker">Consent-based verification</p>
          <h1>
            Control access.
            <br />
            <em>Keep the decision human.</em>
          </h1>
          <p>
            Share only what is needed, for as long as it is needed. TrustLedger
            records the consent and verification context without placing private
            documents on-chain.
          </p>
        </div>
        <div className="login-assurances">
          <span>
            <b />
            Server-side sessions
          </span>
          <span>
            <b />
            OTP-bound approvals
          </span>
          <span>
            <b />
            Ledger-first access
          </span>
        </div>
      </section>

      <section className="login-form-panel">
        <span className="help-link" role="note">
          Demo help is unavailable in this prototype.
        </span>
        <div className="login-card">
          <p className="kicker">Secure sign-in</p>
          <h2>Welcome back</h2>
          <p className="login-intro">
            Use your organisation or business account to continue.
          </p>
          <p className="role-note">
            One entry point for business owners and authorised institution teams.
          </p>

          <Suspense fallback={null}>
            <SessionExpiredNotice />
          </Suspense>

          {displayError && (
            <div className="admin-alert" role="alert">
              <strong>Authentication failed</strong>
              {displayError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@institution.org or name@msme.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="field-label">
              <label htmlFor="password">Password</label>
              <span className="disabled-action" aria-disabled="true">
                Password reset unavailable in prototype
              </span>
            </div>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span
                aria-hidden="true"
                style={{ cursor: "pointer" }}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "◎" : "◉"}
              </span>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}{" "}
              <span>{loading ? "⟳" : "→"}</span>
            </button>
          </form>

          <div className="login-divider">
            <span>demo accounts (TrustLedger123!)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className="light-button"
              style={{ fontSize: "0.75rem", padding: "0.4rem" }}
              onClick={() => {
                setEmail("owner@acmetextiles.example.com");
                setPassword("TrustLedger123!");
              }}
            >
              MSME Owner
            </button>
            <button
              type="button"
              className="light-button"
              style={{ fontSize: "0.75rem", padding: "0.4rem" }}
              onClick={() => {
                setEmail("kyc@banka.example.com");
                setPassword("TrustLedger123!");
              }}
            >
              Bank A KYC
            </button>
            <button
              type="button"
              className="light-button"
              style={{ fontSize: "0.75rem", padding: "0.4rem" }}
              onClick={() => {
                setEmail("loan@banka.example.com");
                setPassword("TrustLedger123!");
              }}
            >
              Bank A Loan
            </button>
            <button
              type="button"
              className="light-button"
              style={{ fontSize: "0.75rem", padding: "0.4rem" }}
              onClick={() => {
                setEmail("kyc@nbfc.example.com");
                setPassword("TrustLedger123!");
              }}
            >
              NBFC KYC
            </button>
          </div>
          <Link className="register-button" href="/register">
            Register an MSME business
          </Link>
          <p className="account-note">
            New to TrustLedger? Your institution admin can create your account.
          </p>
          <p className="login-disclaimer">
            Prototype environment · Do not use real personal data.
          </p>
        </div>
      </section>
    </main>
  );
}

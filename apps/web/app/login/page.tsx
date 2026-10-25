"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/" className="brand">
          <span className="brand-mark">◉</span>TrustLedger
        </Link>
        <div className="login-brand-copy">
          <p className="kicker">Consent-based verification</p>
          <h1>
            Control access.<br />
            <em>Keep the decision human.</em>
          </h1>
          <p>
            Share only what is needed, for as long as it is needed. TrustLedger records
            the consent and verification context without placing private documents on-chain.
          </p>
        </div>
        <div className="login-assurances">
          <span><b />Server-side sessions</span>
          <span><b />OTP-bound approvals</span>
          <span><b />Ledger-first access</span>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-card">
          <p className="kicker">Secure sign-in</p>
          <h2>Welcome back</h2>
          <p className="login-intro">Use your organisation or business account to continue.</p>
          <p className="role-note">One entry point for business owners and authorised institution teams.</p>
          <form>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@institution.org or name@msme.in"
            />
            <div className="field-label">
              <label htmlFor="password">Password</label>
              <Link href="#" className="forgot-password">Forgot password?</Link>
            </div>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <label className="remember">
              <input type="checkbox" /> <span>Remember this device</span>
            </label>
            <button type="button" className="login-submit">
              Sign in <span>→</span>
            </button>
          </form>
          <div className="login-divider">
            <span>or</span>
          </div>
          <Link className="register-button" href="/register">
            Register an MSME business
          </Link>
          <p className="account-note">
            New to TrustLedger? Your institution admin can create your account.
          </p>
        </div>
      </section>
    </main>
  );
}

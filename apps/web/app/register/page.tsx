"use client";

import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <main className="registration-page">
      <section className="registration-context">
        <header className="login-brand-header">
          <Link href="/" className="brand">
            <span className="brand-mark">◒</span>TrustLedger
          </Link>
        </header>
        <div className="registration-copy">
          <p className="kicker">Step 1 of 2 · Create your account</p>
          <h1>
            Start with a business<br />
            <em>you control.</em>
          </h1>
          <p>
            Create a TrustLedger business profile to manage consented document sharing and verification requests.
          </p>
        </div>
        <div className="registration-flow">
          <span className="flow-node owner">
            Business owner<small>Account holder</small>
          </span>
          <span className="flow-node encrypted">
            Encrypted documents<small>Before storage</small>
          </span>
          <span className="flow-node access">
            Permissioned access<small>Owner approved</small>
          </span>
          <i className="flow-line first" />
          <i className="flow-line second" />
        </div>
        <div className="registration-notes">
          <span><b />Your identifiers stay off-chain</span>
          <span><b />Documents are encrypted before storage</span>
          <span><b />You approve each sharing request</span>
        </div>
      </section>
      <section className="registration-form">
        <div className="registration-signin">
          Already registered? <Link href="/login">Sign in</Link>
        </div>
        <div className="registration-card">
          <p className="kicker">Business owner registration</p>
          <h2>Create your account</h2>
          <p>Enter your details to create your TrustLedger business account.</p>
          <form>
            <fieldset>
              <legend>01 · Owner details</legend>
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" placeholder="Your name" />
              <label htmlFor="workEmail">Work email</label>
              <input id="workEmail" type="email" placeholder="name@example.com" />
              <label htmlFor="mobile">Mobile number</label>
              <input id="mobile" type="tel" placeholder="+91 00000 00000" />
            </fieldset>
            <fieldset>
              <legend>02 · Account security</legend>
              <div className="form-grid">
                <div>
                  <label htmlFor="newPassword">Password</label>
                  <div className="password-field">
                    <input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? (
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
                </div>
                <div>
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <div className="password-field">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
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
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend>03 · Business details</legend>
              <label htmlFor="businessName">Legal business name</label>
              <input id="businessName" placeholder="Your registered business name" />
              <div className="form-grid">
                <div>
                  <label htmlFor="gstin">GSTIN <span>Optional</span></label>
                  <input id="gstin" placeholder="27AAAAA0000A1Z5" />
                </div>
                <div>
                  <label htmlFor="businessType">Business type</label>
                  <select id="businessType" defaultValue="">
                    <option value="" disabled>Select business type</option>
                    <option>Manufacturing</option>
                    <option>Services</option>
                    <option>Retail</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </fieldset>
            <label className="terms-consent">
              <input type="checkbox" /> <span>I agree to the terms and consent-based verification policies.</span>
            </label>
            <button type="button" className="login-submit">
              Create business account <span>→</span>
            </button>
          </form>
          <div className="registration-steps">
            <span className="active"><b>01</b> Account and business details</span>
            <span><b>02</b> Upload documents</span>
          </div>
          <p className="registration-footnote">
            Your business reference is created automatically after registration.
          </p>
        </div>
      </section>
    </main>
  );
}

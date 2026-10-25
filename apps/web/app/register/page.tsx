"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "../lib/api";
import { useAuth, dashboardPath } from "../lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [form, setForm] = useState({
    fullName: "",
    workEmail: "",
    mobile: "",
    newPassword: "",
    confirmPassword: "",
    businessName: "",
    gstin: "",
    businessType: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError(null);

    if (!form.fullName || !form.workEmail || !form.newPassword || !form.businessName) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.newPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please acknowledge the prototype disclaimer.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.registerBusiness({
        ownerName: form.fullName,
        email: form.workEmail,
        phone: form.mobile,
        password: form.newPassword,
        legalName: form.businessName,
        gstin: form.gstin || undefined,
        businessType: form.businessType || undefined,
      });
      api.setCsrfToken(result.csrfToken);
      await refresh();
      router.push(dashboardPath(result.user.role));
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="registration-page">
      <section className="registration-context">
        <header className="login-brand-header">
          <Link href="/" className="brand">
            <span className="brand-mark">◒</span>TrustLedger
          </Link>
          <span className="login-badge">Prototype · Synthetic data only</span>
        </header>
        <div className="registration-copy">
          <p className="kicker">Step 1 of 2 · Create your account</p>
          <h1>
            Start with a business
            <br />
            <em>you control.</em>
          </h1>
          <p>
            Create a TrustLedger business profile to manage consented document
            sharing and verification requests.
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
          <span>
            <b />Your identifiers stay off-chain
          </span>
          <span>
            <b />Documents are encrypted before storage
          </span>
          <span>
            <b />You approve each sharing request
          </span>
        </div>
      </section>

      <section className="registration-form">
        <div className="registration-signin">
          Already registered? <Link href="/login">Sign in</Link>
        </div>
        <div className="registration-card">
          <p className="kicker">Business owner registration</p>
          <h2>Create your account</h2>
          <p>Use synthetic details in this prototype environment.</p>

          {error && (
            <div className="admin-alert" role="alert">
              <strong>Registration error</strong>
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <fieldset>
              <legend>01 · Owner details</legend>
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" placeholder="Your name" value={form.fullName} onChange={set("fullName")} />
              <label htmlFor="workEmail">Work email</label>
              <input id="workEmail" type="email" placeholder="name@example.com" value={form.workEmail} onChange={set("workEmail")} />
              <label htmlFor="mobile">Mobile number</label>
              <input id="mobile" type="tel" placeholder="+91 00000 00000" value={form.mobile} onChange={set("mobile")} />
            </fieldset>

            <fieldset>
              <legend>02 · Account security</legend>
              <div className="form-grid">
                <div>
                  <label htmlFor="newPassword">Password</label>
                  <input id="newPassword" type="password" placeholder="Create a password (min 12 chars)" value={form.newPassword} onChange={set("newPassword")} />
                </div>
                <div>
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <input id="confirmPassword" type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={set("confirmPassword")} />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>03 · Business details</legend>
              <label htmlFor="businessName">Legal business name</label>
              <input id="businessName" placeholder="Your registered business name" value={form.businessName} onChange={set("businessName")} />
              <div className="form-grid">
                <div>
                  <label htmlFor="gstin">GSTIN <span>Optional</span></label>
                  <input id="gstin" placeholder="Prototype only" value={form.gstin} onChange={set("gstin")} />
                </div>
                <div>
                  <label htmlFor="businessType">Business type</label>
                  <select id="businessType" value={form.businessType} onChange={set("businessType")}>
                    <option value="" disabled>Select business type</option>
                    <option>Manufacturing</option>
                    <option>Services</option>
                    <option>Retail</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </fieldset>

            <label className="prototype-consent">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{" "}
              <span>
                I understand this is a prototype and will not upload real
                personal or financial information.
              </span>
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Creating account…" : "Create business account"}{" "}
              <span>{loading ? "⟳" : "→"}</span>
            </button>
          </form>

          <div className="registration-steps">
            <span className="active">
              <b>01</b> Account and business details
            </span>
            <span>
              <b>02</b> Upload documents
            </span>
          </div>
          <p className="registration-footnote">
            Your business reference is created after registration. Identity
            proofing is not part of this prototype.
          </p>
        </div>
      </section>
    </main>
  );
}

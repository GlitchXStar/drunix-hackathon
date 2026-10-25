"use client";

import { useState, useCallback } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

export default function RedeemPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ legalName: string; consentId: string; businessRef: string } | null>(null);

  const handleValidate = useCallback(async () => {
    setError(null);
    const sanitized = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (sanitized.length !== 8) {
      setError("Please enter a valid 8-character share code.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.redeemShareCode(sanitized);
      const legalName = (res as any)?.business?.legalName || res.legalName || "Verified Business";
      const businessRef = (res as any)?.business?.businessRef || res.businessRef || "";
      setResult({ legalName, consentId: res.consentId, businessRef });
    } catch (err: any) {
      setError(err?.message || "Invalid or expired share code.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · institution access is consent-controlled
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Institutional desk / KYC verification</p>
            <h1>Redeem a profile share code</h1>
            <p>Validate an MSME-issued code to begin a purpose-limited profile-consent review.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Validation error</strong>
            {error}
          </div>
        )}

        <div className="institution-grid">
          <section className="redemption-card">
            {!result ? (
              <>
                <p className="kicker">Single-use code</p>
                <h2>Enter the share code</h2>
                <label htmlFor="shareCode">8-character share code</label>
                <input
                  id="shareCode"
                  type="text"
                  maxLength={32}
                  placeholder="e.g. PSC-974X"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      handleValidate();
                    }
                  }}
                  style={{ fontFamily: "monospace", fontSize: "1.2rem", letterSpacing: "0.15rem" }}
                />
                <div className="boundary-note">
                  <strong>Limited consent review</strong>
                  <p>A valid code opens a limited profile-consent review; it does not provide file downloads.</p>
                </div>
                <button
                  className="dark-button"
                  onClick={handleValidate}
                  disabled={loading}
                >
                  {loading ? "Validating…" : "Validate code →"}
                </button>
              </>
            ) : (
              <>
                <p className="kicker" style={{ color: "#2e8b57" }}>✓ Code redeemed successfully</p>
                <h2>{result.legalName}</h2>
                <dl>
                  <div>
                    <dt>Consent ID</dt>
                    <dd><code>{result.consentId}</code></dd>
                  </div>
                  <div>
                    <dt>Business Ref</dt>
                    <dd><code>{result.businessRef}</code></dd>
                  </div>
                </dl>
                <p>You can now create a document access request for this business using the consent ID above.</p>
                <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
                  <a href={`/institution/requests/new?businessRef=${encodeURIComponent(result.businessRef)}&consentId=${encodeURIComponent(result.consentId)}`} className="dark-button">
                    Request document access →
                  </a>
                  <button className="light-button" onClick={() => { setResult(null); setCode(""); }}>
                    Redeem another code
                  </button>
                </div>
              </>
            )}
          </section>
          <aside className="institution-sidecard">
            <p className="kicker">Officer session</p>
            <h2>Purpose-bound access.</h2>
            <p>Every validation attempt is recorded. Redeeming a code never creates an automated lending decision.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}

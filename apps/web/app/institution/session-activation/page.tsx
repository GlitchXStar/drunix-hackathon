"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

export default function SessionActivationPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [consentId, setConsentId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"create" | "activate" | "done">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available consents list for quick-selection
  const [availableConsents, setAvailableConsents] = useState<api.ConsentGrant[]>([]);
  const [loadingConsents, setLoadingConsents] = useState(false);

  // Dev OTP state
  const [devOtp, setDevOtp] = useState<api.DevOtpResponse | null>(null);
  const [devOtpLoading, setDevOtpLoading] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);

  // Load consents on mount
  const loadConsents = useCallback(async () => {
    setLoadingConsents(true);
    try {
      const all = await api.listInstitutionConsents();
      // Prioritize active DOCUMENTS consents, but keep PROFILE consents for visibility
      setAvailableConsents(all || []);
      // If there's an active DOCUMENTS consent and input is empty, prefill the latest one
      const docConsent = all?.find((c) => c.scopeType === "DOCUMENTS" && c.status === "ACTIVE");
      if (docConsent && !consentId) {
        setConsentId(docConsent.consentId);
      }
    } catch {
      // Non-fatal if consents list fails to load
    } finally {
      setLoadingConsents(false);
    }
  }, [consentId]);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const fetchDevOtp = useCallback(async (sid: string) => {
    setDevOtpLoading(true);
    try {
      const res = await api.getDevOtpForSession(sid);
      setDevOtp(res);
    } catch {
      // In prod or if disabled
      setDevOtp(null);
    } finally {
      setDevOtpLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    setError(null);
    if (!consentId.trim()) {
      setError("Enter or select a consent ID.");
      return;
    }
    setLoading(true);
    try {
      const session = await api.createAccessSession(consentId.trim());
      const sid = (session as any).id || (session as any).sessionId;
      setSessionId(sid);
      setSessionDetails(session);
      setStep("activate");
      // Fetch dev OTP immediately for seamless local development
      if (sid) {
        fetchDevOtp(sid);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create session.");
    } finally {
      setLoading(false);
    }
  }, [consentId, fetchDevOtp]);

  const handleActivate = useCallback(async () => {
    setError(null);
    if (!sessionId || !otp.trim()) return;
    setLoading(true);
    try {
      await api.activateSession(sessionId, otp.trim());
      setStep("done");
    } catch (err: any) {
      setError(err?.message || "Invalid OTP or session expired.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, otp]);

  const handleCopyAndFillOtp = () => {
    if (devOtp?.code) {
      setOtp(devOtp.code);
      setCopiedOtp(true);
      navigator.clipboard?.writeText(devOtp.code);
      setTimeout(() => setCopiedOtp(false), 2000);
    }
  };

  const documentConsents = availableConsents.filter(
    (c) => c.scopeType === "DOCUMENTS" && c.status === "ACTIVE"
  );
  const otherConsents = availableConsents.filter(
    (c) => c.scopeType !== "DOCUMENTS" && c.status === "ACTIVE"
  );

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · sessions are OTP-activated and fingerprinted
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Institutional desk / sessions</p>
            <h1>Activate document session</h1>
            <p>Create and OTP-activate a consent-bound access session to view approved documents.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Error</strong>
            {error}
          </div>
        )}

        <div className="institution-grid">
          <section className="redemption-card">
            {step === "create" && (
              <>
                <p className="kicker">Step 1 — Create session</p>
                <h2>Link to an approved consent</h2>
                <p className="helper" style={{ marginBottom: "16px" }}>
                  Select an approved <strong>DOCUMENTS</strong> consent below, or paste the consent ID directly.
                </p>

                {/* Quick-select chips */}
                {documentConsents.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                      Approved Document Consents (Click to select):
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {documentConsents.map((c) => (
                        <button
                          key={c.id || c.consentId}
                          type="button"
                          onClick={() => setConsentId(c.consentId)}
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: consentId === c.consentId ? "2px solid #000" : "1px solid #ddd",
                            background: consentId === c.consentId ? "#f8f9fa" : "#fff",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, fontSize: "13px" }}>
                              {c.consentId.slice(0, 8)}... (DOCUMENTS)
                            </span>
                            <div style={{ fontSize: "11px", color: "#666", fontFamily: "monospace" }}>
                              {c.consentId}
                            </div>
                          </div>
                          <span style={{ fontSize: "11px", color: "#2e8b57", fontWeight: 600 }}>
                            {consentId === c.consentId ? "● Selected" : "Select →"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {documentConsents.length === 0 && !loadingConsents && (
                  <div style={{ padding: "12px", background: "#fff8e6", border: "1px solid #ffd591", borderRadius: "6px", marginBottom: "16px", fontSize: "13px" }}>
                    <strong>Note:</strong> No approved DOCUMENTS consents found yet. Ask the business owner to approve your document request in their portal.
                  </div>
                )}

                <label htmlFor="consentIdInput">Consent ID</label>
                <div className="input-group">
                  <input
                    id="consentIdInput"
                    type="text"
                    placeholder="Enter or select an approved DOCUMENTS consent ID"
                    value={consentId}
                    onChange={(e) => setConsentId(e.target.value)}
                  />
                  <button className="dark-button" onClick={handleCreate} disabled={loading || !consentId.trim()}>
                    {loading ? "Creating…" : "Create session →"}
                  </button>
                </div>

                {otherConsents.length > 0 && (
                  <p className="helper" style={{ marginTop: "12px", fontSize: "11px", color: "#888" }}>
                    Tip: If you enter a PROFILE consent ID, TrustLedger will automatically link it to the business's approved document consent if one exists.
                  </p>
                )}
              </>
            )}

            {step === "activate" && (
              <>
                <p className="kicker">Step 2 — OTP activation</p>
                <h2>Enter the session OTP</h2>
                <p>Session ID: <code style={{ fontSize: "13px" }}>{sessionId}</code></p>
                
                {sessionDetails?.deliveryDestinationMasked ? (
                  <div className="delivery-notice" style={{ margin: "12px 0" }}>
                    <span className="delivery-badge real">
                      {sessionDetails.deliveryChannel || "SMS"} Dispatched
                    </span>
                    <span>
                      An activation OTP was sent to the business owner at:{" "}
                      <strong>{sessionDetails.deliveryDestinationMasked}</strong>.
                    </span>
                  </div>
                ) : (
                  <p className="validation-guidance">
                    The business owner received an OTP. Check the dev outbox if running locally.
                  </p>
                )}

                {/* Development OTP Panel */}
                <div className="dev-otp-card" style={{ margin: "14px 0" }}>
                  <div className="dev-otp-header">
                    <div className="dev-otp-title">
                      <span>⚡</span>
                      <span>Development OTP — Local Testing</span>
                    </div>
                    {sessionId && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => fetchDevOtp(sessionId)}
                        disabled={devOtpLoading}
                        style={{ fontSize: "11px" }}
                      >
                        {devOtpLoading ? "Fetching..." : "Refresh OTP"}
                      </button>
                    )}
                  </div>

                  {devOtpLoading && !devOtp ? (
                    <p className="helper" style={{ margin: "8px 0" }}>
                      Retrieving OTP from local dev outbox…
                    </p>
                  ) : devOtp?.code ? (
                    <div className="dev-otp-content">
                      <div className="dev-otp-code-wrap">
                        <span className="dev-otp-code">{devOtp.code}</span>
                        <span className="dev-otp-meta">
                          Valid for 5 mins · {devOtp.attemptsRemaining ?? 5} attempts remaining
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`dev-otp-btn ${copiedOtp ? "copied" : ""}`}
                        onClick={handleCopyAndFillOtp}
                      >
                        {copiedOtp ? "✓ Copied & Filled!" : "Copy & Fill OTP"}
                      </button>
                    </div>
                  ) : (
                    <p className="helper" style={{ margin: "8px 0" }}>
                      {devOtp?.message || "OTP generated and awaiting verification."}
                    </p>
                  )}
                </div>

                <label htmlFor="sessionOtp">One-time password</label>
                <div className="input-group">
                  <input
                    id="sessionOtp"
                    type="text"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{ letterSpacing: "0.2em", fontFamily: "monospace", fontSize: "18px", fontWeight: 700 }}
                  />
                  <button className="dark-button" onClick={handleActivate} disabled={loading || otp.length < 6}>
                    {loading ? "Activating…" : "Activate session"}
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <>
                <p className="kicker" style={{ color: "#2e8b57" }}>✓ Session active</p>
                <h2>Session ready for document viewing</h2>
                <p>Session <code>{sessionId}</code> is now active. Navigate to the document access session page to view approved documents.</p>
                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <Link href={`/institution/access-session`} className="dark-button">
                    View documents →
                  </Link>
                  <button className="light-button" onClick={() => { setStep("create"); setConsentId(""); setSessionId(null); setOtp(""); }}>
                    Create another session
                  </button>
                </div>
              </>
            )}
          </section>

          <aside className="institution-sidecard">
            <p className="kicker">Session security</p>
            <h2>OTP + fingerprint binding.</h2>
            <p>
              Every session is bound to the activating officer, their server session, and browser fingerprint.
              Switching browsers or sessions invalidates the access session immediately.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

type Step = "duration" | "otp" | "code";

export default function ShareCodesPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");

  const [step, setStep] = useState<Step>("duration");
  const [duration, setDuration] = useState(60);
  const [shareCodeId, setShareCodeId] = useState<string | null>(null);
  const [challengeData, setChallengeData] = useState<api.ShareCodeChallenge | null>(null);
  const [otp, setOtp] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev OTP panel state
  const [devOtp, setDevOtp] = useState<api.DevOtpResponse | null>(null);
  const [devOtpLoading, setDevOtpLoading] = useState(false);
  const [devOtpError, setDevOtpError] = useState<string | null>(null);
  const [copiedDevOtp, setCopiedDevOtp] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const fetchDevOtp = useCallback(async (id: string) => {
    setDevOtpLoading(true);
    setDevOtpError(null);
    try {
      const res = await api.getDevOtpForShareCode(id);
      setDevOtp(res);
    } catch (err: any) {
      setDevOtpError(err?.message || "Failed to retrieve local development OTP.");
    } finally {
      setDevOtpLoading(false);
    }
  }, []);

  const handleCreateChallenge = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.createShareCode(duration);
      const activeId = result.shareCodeId || result.challengeId;
      setChallengeData(result);
      setShareCodeId(activeId);
      setStep("otp");
      setOtp("");
      if (result.isDevMode) {
        fetchDevOtp(activeId);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create share code challenge.");
    } finally {
      setLoading(false);
    }
  }, [duration, fetchDevOtp]);

  const handleResend = useCallback(async () => {
    if (!shareCodeId || resendCooldown > 0 || resending) return;
    setError(null);
    setResending(true);
    try {
      const res = await api.resendShareCodeOtp(shareCodeId);
      setChallengeData(res);
      setResendCooldown(30);
      setOtp("");
      if (res.isDevMode) {
        fetchDevOtp(shareCodeId);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to resend OTP. Please wait before retrying.");
    } finally {
      setResending(false);
    }
  }, [shareCodeId, resendCooldown, resending, fetchDevOtp]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleConfirm = useCallback(async () => {
    if (!shareCodeId || !otp || otp.length < 6) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.confirmShareCode(shareCodeId, otp);
      setCode(result.code);
      setExpiresAt(result.expiresAt);
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Invalid OTP. Please check the code and try again.");
      if (challengeData?.isDevMode && shareCodeId) {
        fetchDevOtp(shareCodeId);
      }
    } finally {
      setLoading(false);
    }
  }, [shareCodeId, otp, challengeData, fetchDevOtp]);

  const handleCopyAndFillOtp = useCallback(() => {
    if (!devOtp?.code) return;
    setOtp(devOtp.code);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(devOtp.code).catch(() => {});
    }
    setCopiedDevOtp(true);
    setTimeout(() => setCopiedDevOtp(false), 2000);
  }, [devOtp]);

  const handleCopyCode = useCallback(() => {
    if (!code) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [code]);

  const reset = () => {
    setStep("duration");
    setShareCodeId(null);
    setChallengeData(null);
    setOtp("");
    setCode(null);
    setExpiresAt(null);
    setError(null);
    setDevOtp(null);
    setDevOtpError(null);
    setResendCooldown(0);
  };

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · profile sharing is consent-controlled
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / sharing</p>
            <h1>Profile share codes</h1>
            <p>
              Give an institution time-limited access to your verified business
              profile.
            </p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert" style={{ marginLeft: "52px", marginRight: "52px" }}>
            <strong>Error</strong>
            {error}
          </div>
        )}

        <div className="share-grid">
          <section className="share-card create-code">
            <p className="kicker">Create a profile share code</p>
            <h2>Share context, not your files.</h2>
            <p>
              A code creates limited PROFILE consent for one redeemer. It never
              exposes a document download by itself.
            </p>
            <div className="share-steps">
              <span className={step === "duration" ? "active" : ""}>
                <b>01</b> Choose duration
              </span>
              <span className={step === "otp" ? "active" : ""}>
                <b>02</b> Confirm owner OTP
              </span>
              <span className={step === "code" ? "active" : ""}>
                <b>03</b> Reveal code once
              </span>
            </div>

            {step === "duration" && (
              <>
                <label htmlFor="duration">Code duration</label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value={60}>60 minutes</option>
                  <option value={240}>4 hours</option>
                  <option value={1440}>24 hours (maximum)</option>
                </select>
                <p className="helper">
                  Each code is one-time use. The business owner must confirm it
                  by OTP before it can be revealed.
                </p>
                <button
                  className="dark-button"
                  onClick={handleCreateChallenge}
                  disabled={loading}
                >
                  {loading ? "Requesting OTP…" : "Continue to OTP"}{" "}
                  <span>→</span>
                </button>
              </>
            )}

            {step === "otp" && (
              <>
                {/* Honest delivery destination messaging */}
                {challengeData?.isDevMode ? (
                  <div className="delivery-notice dev-mode">
                    <span className="delivery-badge dev">Local Testing</span>
                    <strong>Real SMS/email delivery is not configured.</strong>
                    <span>
                      Local testing uses the simulated development outbox. Destined for owner contact:{" "}
                      <strong>{challengeData.deliveryDestinationMasked || "registered contact"}</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="delivery-notice">
                    <span className="delivery-badge real">
                      {challengeData?.deliveryChannel === "SMS" ? "SMS Dispatched" : "Email Dispatched"}
                    </span>
                    <span>
                      An OTP has been sent to your registered contact:{" "}
                      <strong>{challengeData?.deliveryDestinationMasked}</strong> via{" "}
                      {challengeData?.deliveryChannel === "SMS" ? "SMS" : "Email"}.
                    </span>
                  </div>
                )}

                {/* Development OTP Panel */}
                {challengeData?.isDevMode && (
                  <div className="dev-otp-card">
                    <div className="dev-otp-header">
                      <div className="dev-otp-title">
                        <span>⚡</span>
                        <span>Development OTP — Local Testing Only</span>
                      </div>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => shareCodeId && fetchDevOtp(shareCodeId)}
                        disabled={devOtpLoading}
                        style={{ fontSize: "11px" }}
                      >
                        {devOtpLoading ? "Fetching..." : "Refresh OTP"}
                      </button>
                    </div>

                    {devOtpLoading && !devOtp ? (
                      <p className="helper" style={{ margin: "8px 0" }}>Retrieving OTP from local dev outbox…</p>
                    ) : devOtpError ? (
                      <div className="admin-alert" style={{ margin: "8px 0", padding: "8px 12px", fontSize: "11px" }}>
                        {devOtpError}
                      </div>
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
                          className={`dev-otp-btn ${copiedDevOtp ? "copied" : ""}`}
                          onClick={handleCopyAndFillOtp}
                        >
                          {copiedDevOtp ? "✓ Copied & Filled!" : "Copy & Fill OTP"}
                        </button>
                      </div>
                    ) : (
                      <p className="helper" style={{ margin: "8px 0" }}>
                        {devOtp?.message || "No active OTP found. Try requesting a new one."}
                      </p>
                    )}
                  </div>
                )}

                <label htmlFor="otpInput">Enter 6-digit verification code</label>
                <input
                  id="otpInput"
                  type="text"
                  className="otp-input-field"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otp.length === 6 && !loading) {
                      handleConfirm();
                    }
                  }}
                />

                <div className="otp-button-group">
                  <button
                    className="dark-button"
                    onClick={handleConfirm}
                    disabled={loading || otp.length < 6}
                  >
                    {loading ? "Verifying…" : "Confirm and reveal code"}
                  </button>
                  <button
                    type="button"
                    className="light-button"
                    onClick={handleResend}
                    disabled={resending || resendCooldown > 0}
                  >
                    {resending
                      ? "Resending…"
                      : resendCooldown > 0
                      ? `Resend OTP (${resendCooldown}s)`
                      : "Resend OTP"}
                  </button>
                  <button type="button" className="text-button" onClick={reset}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {step === "code" && (
              <>
                <p className="kicker" style={{ color: "#2e8b57" }}>
                  ✓ Share code generated
                </p>
                <div
                  className="code-inputs"
                  style={{
                    fontSize: "1.5rem",
                    letterSpacing: "0.3rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    background: "#f9f9f7",
                    border: "1px solid #dcdcd5",
                    borderRadius: "6px",
                    margin: "16px 0",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{code}</span>
                  <button
                    type="button"
                    className={`dev-otp-btn ${copiedCode ? "copied" : ""}`}
                    onClick={handleCopyCode}
                    style={{ fontSize: "11px", padding: "8px 14px" }}
                  >
                    {copiedCode ? "✓ Copied!" : "Copy Code"}
                  </button>
                </div>
                <p>
                  This code is shown <strong>once</strong>. It expires at{" "}
                  {expiresAt
                    ? new Date(expiresAt).toLocaleTimeString("en-IN")
                    : "—"}{" "}
                  and can be redeemed by one institution.
                </p>
                <button className="dark-button" onClick={reset}>
                  Create another code
                </button>
              </>
            )}
          </section>

          <aside className="institution-view">
            <p className="kicker">What an institution can see</p>
            <h2>Only the profile you consent to.</h2>
            <ul>
              <li><b>✓</b> Legal business name and basic profile</li>
              <li><b>✓</b> Verification attestations with active consent</li>
              <li><b>×</b> Documents or file contents</li>
              <li><b>×</b> Bank A private KYC notes</li>
              <li><b>×</b> Financial risk assessments</li>
            </ul>
            <p>
              Redemption creates an audit event and notifies the business owner.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}


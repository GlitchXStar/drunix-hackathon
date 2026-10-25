"use client";

import { useState, useCallback, useEffect } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function RequestsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const { data: requests, loading, error, refetch } = useApi(() => api.listBusinessRequests());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Approval Modal & OTP state
  const [approvingRequest, setApprovingRequest] = useState<api.AccessRequest | null>(null);
  const [challengeData, setChallengeData] = useState<api.RequestApprovalChallenge | null>(null);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [otp, setOtp] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dev OTP panel state
  const [devOtp, setDevOtp] = useState<api.DevOtpResponse | null>(null);
  const [devOtpLoading, setDevOtpLoading] = useState(false);
  const [devOtpError, setDevOtpError] = useState<string | null>(null);
  const [copiedDevOtp, setCopiedDevOtp] = useState(false);

  // Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const fetchDevOtp = useCallback(async (requestId: string) => {
    setDevOtpLoading(true);
    setDevOtpError(null);
    try {
      const res = await api.getDevOtpForRequest(requestId);
      setDevOtp(res);
    } catch (err: any) {
      setDevOtpError(err?.message || "Failed to retrieve local development OTP.");
    } finally {
      setDevOtpLoading(false);
    }
  }, []);

  const handleStartApprove = useCallback(async (req: api.AccessRequest) => {
    setActionError(null);
    setActionLoading(req.id);
    setModalError(null);
    setOtp("");
    setDevOtp(null);
    setDevOtpError(null);
    setCopiedDevOtp(false);
    setResendCooldown(0);
    setSelectedDocTypes(req.requestedDocTypes || []);
    try {
      const challenge = await api.issueApprovalOtp(req.id);
      setChallengeData(challenge);
      setApprovingRequest(req);
      if (challenge.isDevMode) {
        fetchDevOtp(req.id);
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to initiate approval challenge.");
    } finally {
      setActionLoading(null);
    }
  }, [fetchDevOtp]);

  const handleResendOtp = useCallback(async () => {
    if (!approvingRequest || resendCooldown > 0 || resending) return;
    setModalError(null);
    setResending(true);
    try {
      const challenge = await api.issueApprovalOtp(approvingRequest.id);
      setChallengeData(challenge);
      setResendCooldown(30);
      setOtp("");
      if (challenge.isDevMode) {
        fetchDevOtp(approvingRequest.id);
      }
    } catch (err: any) {
      setModalError(err?.message || "Failed to resend OTP. Please wait before retrying.");
    } finally {
      setResending(false);
    }
  }, [approvingRequest, resendCooldown, resending, fetchDevOtp]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCopyAndFillOtp = useCallback(() => {
    if (!devOtp?.code) return;
    setOtp(devOtp.code);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(devOtp.code).catch(() => {});
    }
    setCopiedDevOtp(true);
    setTimeout(() => setCopiedDevOtp(false), 2000);
  }, [devOtp]);

  const handleConfirmApproval = useCallback(async () => {
    if (!approvingRequest || !otp || otp.length < 6) return;
    setModalError(null);
    setSubmitting(true);
    try {
      await api.decideRequest(
        approvingRequest.id,
        "APPROVE",
        otp,
        undefined,
        undefined,
        undefined,
        selectedDocTypes.length > 0 ? selectedDocTypes : approvingRequest.requestedDocTypes,
      );
      setApprovingRequest(null);
      setChallengeData(null);
      setOtp("");
      refetch();
    } catch (err: any) {
      setModalError(err?.message || "Failed to approve request. Please check the OTP and try again.");
      if (challengeData?.isDevMode) {
        fetchDevOtp(approvingRequest.id);
      }
    } finally {
      setSubmitting(false);
    }
  }, [approvingRequest, otp, challengeData, selectedDocTypes, fetchDevOtp, refetch]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setApprovingRequest(null);
    setChallengeData(null);
    setOtp("");
    setModalError(null);
    setDevOtp(null);
    setDevOtpError(null);
    setResendCooldown(0);
  }, [submitting]);

  const handleReject = useCallback(async (reqId: string) => {
    setActionError(null);
    setActionLoading(reqId);
    try {
      await api.decideRequest(reqId, "REJECT");
      refetch();
    } catch (err: any) {
      setActionError(err?.message || "Failed to reject request.");
    } finally {
      setActionLoading(null);
    }
  }, [refetch]);

  const items = requests || [];

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · all requests are consent-controlled
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / requests</p>
            <h1>Access requests</h1>
            <p>Review, approve or reject institutional requests for your documents.</p>
          </div>
        </header>

        {(error || actionError) && (
          <div className="admin-alert" role="alert">
            <strong>Error</strong>
            {error || actionError}
          </div>
        )}

        <section className="vault-card">
          <div className="vault-card-head">
            <div>
              <p className="kicker">Incoming requests</p>
              <h2>Institutional verification requests</h2>
            </div>
            <span className="vault-count">
              {loading ? "Loading…" : `${items.length} requests`}
            </span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <strong>{req.scopeType} request</strong>
                      <small>
                        {req.requestedDocTypes?.join(", ") || "—"} ·{" "}
                        {new Date(req.createdAt).toLocaleDateString("en-IN")}
                      </small>
                    </td>
                    <td>{req.purposeCode}</td>
                    <td>
                      <span
                        className={
                          req.status === "APPROVED" || req.status === "PARTIALLY_APPROVED"
                            ? "status registered"
                            : req.status === "REJECTED"
                            ? "status expired"
                            : "status pending"
                        }
                      >
                        {req.status}
                      </span>
                    </td>
                    <td>
                      {req.status === "PENDING" && (
                        <>
                          <button
                            className="dark-button"
                            disabled={actionLoading === req.id}
                            onClick={() => handleStartApprove(req)}
                          >
                            {actionLoading === req.id ? "…" : "Approve"}
                          </button>
                          <button
                            className="light-button"
                            disabled={actionLoading === req.id}
                            onClick={() => handleReject(req.id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {req.status !== "PENDING" && <span>—</span>}
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>
                      No access requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {/* Approval OTP Modal */}
      {approvingRequest && (
        <div className="tl-modal-backdrop" onClick={closeModal}>
          <div className="tl-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="tl-modal-header">
              <div>
                <p className="kicker" style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.08em" }}>
                  Customer authorization · OTP Challenge
                </p>
                <h3>Approve Access Request</h3>
                <p>Confirm authorization for this institutional data request.</p>
              </div>
              <button
                type="button"
                className="tl-modal-close"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="tl-modal-body">
              {modalError && (
                <div className="admin-alert" role="alert" style={{ marginBottom: "16px" }}>
                  <strong>Error</strong>
                  {modalError}
                </div>
              )}

              <div className="tl-modal-req-summary">
                <div>
                  <strong>Request Type:</strong> {approvingRequest.scopeType} request
                </div>
                <div>
                  <strong>Requested Documents:</strong>{" "}
                  {approvingRequest.requestedDocTypes?.length
                    ? approvingRequest.requestedDocTypes.join(", ")
                    : "Full Profile"}
                </div>
                <div>
                  <strong>Purpose:</strong> {approvingRequest.purposeCode}
                </div>
              </div>

              {/* Document checklist selection */}
              {approvingRequest.scopeType === "DOCUMENTS" &&
                approvingRequest.requestedDocTypes &&
                approvingRequest.requestedDocTypes.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "8px",
                        color: "#222220",
                      }}
                    >
                      Documents to approve in consent grant
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {approvingRequest.requestedDocTypes.map((dt) => (
                        <label
                          key={dt}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            color: "#333330",
                            cursor: "pointer",
                            background: "#fafaf8",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #ebebe5",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDocTypes.includes(dt)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDocTypes((prev) => [...prev, dt]);
                              } else {
                                setSelectedDocTypes((prev) => prev.filter((x) => x !== dt));
                              }
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>{dt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              {/* Delivery notice */}
              {challengeData?.isDevMode ? (
                <div className="delivery-notice dev-mode" style={{ marginBottom: "16px" }}>
                  <span className="delivery-badge dev">Local Testing</span>
                  <strong>Real SMS/email delivery is not configured.</strong>
                  <span>
                    Local testing uses the simulated development outbox. Destined for owner contact:{" "}
                    <strong>{challengeData.deliveryDestinationMasked || "registered contact"}</strong>.
                  </span>
                </div>
              ) : (
                <div className="delivery-notice" style={{ marginBottom: "16px" }}>
                  <span className="delivery-badge real">
                    {challengeData?.deliveryChannel === "SMS" ? "SMS Dispatched" : "Email Dispatched"}
                  </span>
                  <span>
                    An OTP has been sent to your registered contact:{" "}
                    <strong>{challengeData?.deliveryDestinationMasked || "contact"}</strong> via{" "}
                    {challengeData?.deliveryChannel === "SMS" ? "SMS" : "Email"}.
                  </span>
                </div>
              )}

              {/* Development OTP Panel */}
              {challengeData?.isDevMode && (
                <div className="dev-otp-card" style={{ marginTop: 0 }}>
                  <div className="dev-otp-header">
                    <div className="dev-otp-title">
                      <span>⚡</span>
                      <span>Development OTP — Local Testing Only</span>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => fetchDevOtp(approvingRequest.id)}
                      disabled={devOtpLoading}
                      style={{ fontSize: "11px" }}
                    >
                      {devOtpLoading ? "Fetching..." : "Refresh OTP"}
                    </button>
                  </div>

                  {devOtpLoading && !devOtp ? (
                    <p className="helper" style={{ margin: "8px 0" }}>
                      Retrieving OTP from local dev outbox…
                    </p>
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
                      {devOtp?.message || "No active OTP found. Try clicking Resend OTP."}
                    </p>
                  )}
                </div>
              )}

              <label htmlFor="modalOtpInput" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                Enter 6-digit verification code
              </label>
              <input
                id="modalOtpInput"
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
                  if (e.key === "Enter" && otp.length === 6 && !submitting) {
                    handleConfirmApproval();
                  }
                }}
              />
            </div>

            <div className="tl-modal-footer">
              <button
                type="button"
                className="light-button"
                onClick={closeModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="light-button"
                onClick={handleResendOtp}
                disabled={resending || resendCooldown > 0 || submitting}
              >
                {resending
                  ? "Resending…"
                  : resendCooldown > 0
                  ? `Resend (${resendCooldown}s)`
                  : "Resend OTP"}
              </button>
              <button
                type="button"
                className="dark-button"
                onClick={handleConfirmApproval}
                disabled={submitting || otp.length < 6 || (approvingRequest.scopeType === "DOCUMENTS" && selectedDocTypes.length === 0)}
              >
                {submitting ? "Approving…" : "Confirm & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

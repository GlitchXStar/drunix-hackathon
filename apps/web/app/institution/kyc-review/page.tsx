"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

export default function KycReviewPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");
  const router = useRouter();

  const [consentId, setConsentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [docRefs, setDocRefs] = useState("");
  const [checklist, setChecklist] = useState({
    entityDetailsConsistent: true,
    registrationsCurrent: true,
    escalationRequired: false,
  });
  const [outcome, setOutcome] = useState("VERIFIED");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!consentId || !sessionId) {
      setError("Consent ID and Session ID are required.");
      return;
    }
    setLoading(true);
    try {
      const docRefsArr = docRefs.split(",").map((s) => s.trim()).filter(Boolean);
      const result = await api.createKycReview({
        consentId,
        accessSessionId: sessionId,
        docRefsReviewed: docRefsArr,
        checklist,
        outcome,
        notes: notes.trim() || "KYC review completed per institution checklist.",
      });
      setReviewId(result.id || result.reviewId);
    } catch (err: any) {
      setError(err?.message || "Failed to submit KYC review.");
    } finally {
      setLoading(false);
    }
  }, [consentId, sessionId, docRefs, checklist, outcome, notes]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · KYC review notes remain private to your institution
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">KYC review / record</p>
            <h1>Record KYC review</h1>
            <p>Document what you reviewed; this record is never shared with another institution.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Error</strong>
            {error}
          </div>
        )}

        {reviewId ? (
          <section className="redemption-card" style={{ maxWidth: "600px" }}>
            <p className="kicker" style={{ color: "#2e8b57" }}>✓ KYC review recorded</p>
            <h2>Review ID: <code>{reviewId}</code></h2>
            <p>You can now proceed to issue an attestation if the outcome was VERIFIED.</p>
            <button className="dark-button" onClick={() => router.push("/institution/attestations/issue")}>
              Continue to attestation →
            </button>
          </section>
        ) : (
          <div className="kyc-review-layout">
            <form className="kyc-review-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
              <fieldset>
                <legend>00 · Session reference</legend>
                <div className="form-fields">
                  <div className="form-field">
                    <label htmlFor="consentIdInput">Consent ID</label>
                    <input
                      id="consentIdInput"
                      type="text"
                      placeholder="UUID of the consent grant"
                      value={consentId}
                      onChange={(e) => setConsentId(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="sessionIdInput">Access Session ID</label>
                    <input
                      id="sessionIdInput"
                      type="text"
                      placeholder="UUID of the active session"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="docRefsInput">Document Refs reviewed (comma-separated)</label>
                    <input
                      id="docRefsInput"
                      type="text"
                      placeholder="docRef-1, docRef-2"
                      value={docRefs}
                      onChange={(e) => setDocRefs(e.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>01 · Checklist</legend>
                <div className="review-checklist">
                  <label>
                    <input type="checkbox" checked={checklist.entityDetailsConsistent}
                      onChange={(e) => setChecklist((c) => ({ ...c, entityDetailsConsistent: e.target.checked }))} />
                    Legal entity details are consistent
                  </label>
                  <label>
                    <input type="checkbox" checked={checklist.registrationsCurrent}
                      onChange={(e) => setChecklist((c) => ({ ...c, registrationsCurrent: e.target.checked }))} />
                    Registrations are current at review time
                  </label>
                  <label>
                    <input type="checkbox" checked={checklist.escalationRequired}
                      onChange={(e) => setChecklist((c) => ({ ...c, escalationRequired: e.target.checked }))} />
                    Escalation or supporting information required
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>02 · Officer outcome</legend>
                <div className="outcome-options">
                  <label><input type="radio" name="outcome" value="VERIFIED" checked={outcome === "VERIFIED"} onChange={(e) => setOutcome(e.target.value)} /> Verified</label>
                  <label><input type="radio" name="outcome" value="NOT_VERIFIED" checked={outcome === "NOT_VERIFIED"} onChange={(e) => setOutcome(e.target.value)} /> Not verified</label>
                  <label><input type="radio" name="outcome" value="NEEDS_MORE_INFO" checked={outcome === "NEEDS_MORE_INFO"} onChange={(e) => setOutcome(e.target.value)} /> Needs more information</label>
                </div>
                <label htmlFor="review-note">Internal review notes</label>
                <textarea id="review-note" placeholder="Describe the review context, exceptions, or follow-up needed. These notes stay within your institution." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </fieldset>

              <div className="review-actions">
                <button type="submit" className="dark-button" disabled={loading}>
                  {loading ? "Submitting…" : "Submit KYC review"} <span>→</span>
                </button>
              </div>
            </form>

            <aside className="review-context-card">
              <p className="kicker">Review context</p>
              <h2>Private KYC record</h2>
              <p>Notes and checklist outcomes are your institution's internal records. They are not placed on the ledger and never appear in cross-institution attestation lookup.</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppSidebar from "../../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../../lib/auth-context";
import * as api from "../../../lib/api";

function IssueAttestationContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [kycReviewId, setKycReviewId] = useState(searchParams.get("reviewId") || "");
  const [attestationType, setAttestationType] = useState("KYC_BASIC");
  const [validityMonths, setValidityMonths] = useState(12);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<api.Attestation | null>(null);

  const handleIssue = useCallback(async () => {
    setError(null);
    if (!kycReviewId.trim()) {
      setError("Please specify the eligible VERIFIED KYC review ID.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm the KYC review verification before issuing.");
      return;
    }

    setLoading(true);
    try {
      const att = await api.issueAttestation({
        kycReviewId: kycReviewId.trim(),
        validityMonths: Number(validityMonths),
        type: attestationType,
      });
      setResult(att);
    } catch (err: any) {
      setError(err?.message || "Failed to issue attestation. Verify review outcome is VERIFIED.");
    } finally {
      setLoading(false);
    }
  }, [kycReviewId, confirmed, validityMonths, attestationType]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · issuance anchors minimal verification proof to Drunix
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Attestation issue / Drunix</p>
            <h1>Issue KYC attestation</h1>
            <p>Publish an immutable verification record anchored to the verified document hash snapshot.</p>
          </div>
          <span className={result ? "status registered" : "status pending"}>
            {result ? "ISSUED ON LEDGER" : "DRAFT"}
          </span>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Error</strong>
            {error}
          </div>
        )}

        {result && (
          <div className="admin-alert" role="status" style={{ borderColor: "var(--color-registered)" }}>
            <strong>Attestation Successfully Issued on Drunix</strong>
            <p>Attestation ID: <code>{result.id}</code></p>
            <p>Business Reference: <code>{result.businessRef}</code></p>
            <p>Status: <strong>{result.status}</strong> · Valid until: {new Date(result.validUntil).toLocaleDateString("en-IN")}</p>
            <div style={{ marginTop: "1rem" }}>
              <Link className="dark-button" href="/institution/attestations/manage">
                View in Attestations Management →
              </Link>
            </div>
          </div>
        )}

        {!result && (
          <div className="attestation-issue-layout">
            <form className="attestation-issue-form" onSubmit={(e) => { e.preventDefault(); handleIssue(); }}>
              <fieldset>
                <legend>01 · Source KYC review</legend>
                <div className="form-field">
                  <label htmlFor="kycReviewId">Verified KYC review ID</label>
                  <input
                    id="kycReviewId"
                    type="text"
                    value={kycReviewId}
                    onChange={(e) => setKycReviewId(e.target.value)}
                    placeholder="Paste the review ID from the KYC review step"
                    required
                  />
                  <p className="field-intro">
                    Only reviews with outcome <code>VERIFIED</code> qualify for attestation issuance per SPEC §8.5.
                  </p>
                </div>
              </fieldset>

              <fieldset>
                <legend>02 · Attestation parameters</legend>
                <label htmlFor="attestation-type">Attestation type</label>
                <select
                  id="attestation-type"
                  value={attestationType}
                  onChange={(e) => setAttestationType(e.target.value)}
                >
                  <option value="KYC_BASIC">KYC_BASIC · Identity and registration evidence</option>
                </select>

                <label htmlFor="validity-months">Validity period (months): {validityMonths}</label>
                <input
                  id="validity-months"
                  type="range"
                  min="1"
                  max="24"
                  value={validityMonths}
                  onChange={(e) => setValidityMonths(Number(e.target.value))}
                />
                <p className="field-intro">
                  Standard validity is 12 months (maximum 24 months). Expiry is dynamically computed on Drunix.
                </p>
              </fieldset>

              <fieldset>
                <legend>03 · Issuance confirmation</legend>
                <label className="issue-confirm" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I confirm the KYC review outcome is VERIFIED and this attestation anchors the active document hash snapshot.
                </label>
              </fieldset>

              <div className="review-actions" style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                <Link className="light-button" href="/institution/kyc-review">
                  Back to review
                </Link>
                <button
                  className="dark-button"
                  type="submit"
                  disabled={!confirmed || loading}
                >
                  {loading ? "Issuing on Drunix…" : "Issue KYC attestation →"}
                </button>
              </div>
            </form>

            <aside className="issue-boundary-card">
              <p className="kicker">Issuer boundary</p>
              <h2>Your institution owns this record.</h2>
              <dl>
                <div>
                  <dt>Attestation type</dt>
                  <dd>{attestationType}</dd>
                </div>
                <div>
                  <dt>Validity</dt>
                  <dd>{validityMonths} months</dd>
                </div>
                <div>
                  <dt>Status after issue</dt>
                  <dd>VALID</dd>
                </div>
              </dl>
              <p>
                Other institutions verify type, status, dates, and whether source document hashes changed. They never see internal review notes or checklists.
              </p>
            </aside>
          </div>
        )}

        <section className="activation-notice">
          <strong>After issuance:</strong> Your institution can suspend or revoke this attestation with an operational reason code. A revoked attestation is permanent and cannot be reinstated per D-9.
        </section>
      </section>
    </main>
  );
}

export default function IssueAttestationPage() {
  return (
    <Suspense fallback={<div>Loading attestation issue…</div>}>
      <IssueAttestationContent />
    </Suspense>
  );
}

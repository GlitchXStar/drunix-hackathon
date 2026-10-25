"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import AppSidebar from "../../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../../lib/auth-context";
import * as api from "../../../lib/api";

const REASON_CODES = [
  { id: "DOCUMENTS_SUPERSEDED", label: "Documents superseded or replaced by MSME" },
  { id: "FRAUD_SUSPECTED", label: "Fraud or misrepresentation suspected" },
  { id: "BUSINESS_DISSOLVED", label: "Business dissolution or deregistration" },
  { id: "OFFICER_REVIEW_ERROR", label: "Officer review error identified during internal audit" },
  { id: "POLICY_NON_COMPLIANCE", label: "Regulatory policy non-compliance" },
];

export default function ManageAttestationsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [attestationId, setAttestationId] = useState("");
  const [targetStatus, setTargetStatus] = useState<"SUSPENDED" | "REVOKED">("SUSPENDED");
  const [reasonCode, setReasonCode] = useState("DOCUMENTS_SUPERSEDED");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpdateStatus = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!attestationId.trim()) {
      setError("Please specify the attestation ID.");
      return;
    }

    setLoading(true);
    try {
      await api.updateAttestationStatus(attestationId.trim(), targetStatus, reasonCode);
      setSuccess(`Attestation ${attestationId.trim()} has been updated to ${targetStatus} on Drunix.`);
    } catch (err: any) {
      setError(err?.message || "Failed to update attestation status. Verify issuer authority and D-9 rules.");
    } finally {
      setLoading(false);
    }
  }, [attestationId, targetStatus, reasonCode]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · institutions may change only attestations they issued
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Institution / issued verification records</p>
            <h1>Manage attestations</h1>
            <p>Execute lifecycle status updates on Drunix for attestations issued by your institution.</p>
          </div>
          <Link className="dark-button" href="/institution/attestations/issue">
            Issue attestation <span>→</span>
          </Link>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Error</strong>
            {error}
          </div>
        )}

        {success && (
          <div className="admin-alert" role="status" style={{ borderColor: "var(--color-registered)" }}>
            <strong>Success</strong>
            {success}
          </div>
        )}

        <div className="request-layout">
          <section className="request-form">
            <fieldset>
              <legend>01 · Target attestation</legend>
              <label htmlFor="att-id">Attestation ID</label>
              <input
                id="att-id"
                type="text"
                value={attestationId}
                onChange={(e) => setAttestationId(e.target.value)}
                placeholder="Paste the on-chain attestation ID"
              />
            </fieldset>

            <fieldset>
              <legend>02 · Lifecycle transition (Rule D-9)</legend>
              <label htmlFor="target-status">New status</label>
              <select
                id="target-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as "SUSPENDED" | "REVOKED")}
              >
                <option value="SUSPENDED">SUSPENDED · Temporarily halt validity (can transition to REVOKED)</option>
                <option value="REVOKED">REVOKED · Permanently invalidate (terminal status)</option>
              </select>

              <label htmlFor="reason-code">Operational reason code</label>
              <select
                id="reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                {REASON_CODES.map((rc) => (
                  <option key={rc.id} value={rc.id}>
                    {rc.id} · {rc.label}
                  </option>
                ))}
              </select>
            </fieldset>

            <div style={{ marginTop: "1.5rem" }}>
              <button
                className="dark-button"
                onClick={handleUpdateStatus}
                disabled={loading || !attestationId.trim()}
              >
                {loading ? "Recording on Drunix…" : `Confirm ${targetStatus} on ledger →`}
              </button>
            </div>
          </section>

          <aside className="issue-boundary-card">
            <p className="kicker">D-9 Lifecycle Rules</p>
            <h2>Status transitions are one-way.</h2>
            <ul style={{ paddingLeft: "1.2rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
              <li><strong>VALID → SUSPENDED:</strong> Permitted with reason code.</li>
              <li><strong>VALID → REVOKED:</strong> Permitted with reason code.</li>
              <li><strong>SUSPENDED → REVOKED:</strong> Permitted.</li>
              <li><strong>Reinstatement prohibited:</strong> Neither suspended nor revoked attestations can return to VALID. Issue a new one after fresh review.</li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}

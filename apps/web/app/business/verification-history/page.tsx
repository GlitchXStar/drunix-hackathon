"use client";

import Link from "next/link";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function VerificationHistoryPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const { data: attestations, loading, error } = useApi(() => api.listBusinessAttestations());

  const items = attestations || [];
  const activeCount = items.filter((a: any) => a.status === "VALID").length;

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · attestations show issuer-recorded status on Drunix
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / verification</p>
            <h1>Verification history</h1>
            <p>Review the attestations issued for your business by verifying institutions.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Notice</strong>
            {error}
          </div>
        )}

        <section className="verification-summary">
          <article>
            <span>TOTAL ATTESTATIONS</span>
            <strong>{loading ? "…" : items.length}</strong>
            <p>On-chain records across all institutions.</p>
          </article>
          <article>
            <span>ACTIVE STATUS</span>
            <strong>{loading ? "…" : activeCount}</strong>
            <p>Currently valid and eligible for sharing.</p>
          </article>
          <article>
            <span>PROTECTION LEVEL</span>
            <strong>I-3 &amp; D-9</strong>
            <p>Zero personal documents or notes on ledger.</p>
          </article>
        </section>

        <section className="verification-table">
          <div className="section-card-head">
            <div>
              <p className="kicker">Issued records</p>
              <h2>Attestations and status</h2>
            </div>
            <span>{loading ? "Loading…" : `${items.length} records`}</span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Attestation ID</th>
                  <th>Issuer Node</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Valid Until</th>
                </tr>
              </thead>
              <tbody>
                {items.map((att: any) => (
                  <tr key={att.id || att.attId}>
                    <td>
                      <strong>{att.attId || att.id}</strong>
                      <small>Issued {new Date(att.createdAt || att.issuedAt).toLocaleDateString("en-IN")}</small>
                    </td>
                    <td>{att.issuerInstId || "Bank A"}</td>
                    <td>{att.type || "KYC_BASIC"}</td>
                    <td>
                      <span
                        className={
                          att.status === "VALID"
                            ? "status registered"
                            : att.status === "SUSPENDED"
                            ? "status pending"
                            : "status expired"
                        }
                      >
                        {att.status}
                      </span>
                    </td>
                    <td>{new Date(att.validUntil).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                      No attestations have been issued for your business yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="verification-meaning">
          <div>
            <p className="kicker">What this means</p>
            <h2>An attestation is a recorded status, not a document leak.</h2>
          </div>
          <p>
            Each entry anchors an institution&apos;s verification outcome to Drunix. If you replace or delete an uploaded document, TrustLedger marks the hash change so future verifiers know to request fresh evidence.
          </p>
        </section>
      </section>
    </main>
  );
}

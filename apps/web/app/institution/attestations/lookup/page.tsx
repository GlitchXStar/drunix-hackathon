"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import AppSidebar from "../../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../../lib/auth-context";
import * as api from "../../../lib/api";

export default function AttestationLookupPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [consentId, setConsentId] = useState("");
  const [attestations, setAttestations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleLookup = useCallback(async () => {
    setError(null);
    if (!consentId.trim()) {
      setError("Please enter an active PROFILE consent ID.");
      return;
    }
    setLoading(true);
    try {
      const results = await api.lookupAttestations(consentId.trim());
      setAttestations(results);
      setSearched(true);
    } catch (err: any) {
      setError(
        err?.message ||
          "Attestation lookup failed. Ensure you have an active PROFILE consent for this business.",
      );
      setAttestations([]);
    } finally {
      setLoading(false);
    }
  }, [consentId]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · lookup requires active PROFILE consent on Drunix
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Consent-limited verification / Cross-institution</p>
            <h1>Look up attestations</h1>
            <p>Query authoritative on-chain verification records from other institutions using an active PROFILE consent.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Notice</strong>
            {error}
          </div>
        )}

        <div className="lookup-layout">
          <section className="lookup-card">
            <p className="kicker">Step 1 — PROFILE Consent ID</p>
            <h2>Enter active consent reference</h2>
            <div className="input-group">
              <input
                type="text"
                placeholder="Paste consent ID (received from redeemed share code)"
                value={consentId}
                onChange={(e) => setConsentId(e.target.value)}
              />
              <button
                className="dark-button"
                onClick={handleLookup}
                disabled={loading || !consentId.trim()}
              >
                {loading ? "Verifying on Drunix…" : "Query ledger →"}
              </button>
            </div>
            <p className="field-intro" style={{ marginBottom: "1.5rem" }}>
              Don&apos;t have a consent ID yet? Redeem the MSME&apos;s share code first on the{" "}
              <Link href="/institution/redeem" className="table-link">
                Redeem share code
              </Link>{" "}
              page.
            </p>

            {searched && attestations.length > 0 && (
              <div>
                <p className="kicker">On-chain verification records ({attestations.length})</p>
                {attestations.map((att: any) => (
                  <div key={att.attId} className="lookup-result" style={{ marginBottom: "1.5rem" }}>
                    <div>
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
                      <strong>{att.type}</strong>
                      <small>
                        Issued by {att.issuerInstitution?.name || "Partner Institution"} (
                        {att.issuerInstitution?.mspId || "Drunix Node"})
                      </small>
                    </div>
                    <dl>
                      <div>
                        <dt>Attestation ID</dt>
                        <dd><code>{att.attId}</code></dd>
                      </div>
                      <div>
                        <dt>Issued at</dt>
                        <dd>{new Date(att.issuedAt).toLocaleDateString("en-IN")}</dd>
                      </div>
                      <div>
                        <dt>Valid until</dt>
                        <dd>{new Date(att.validUntil).toLocaleDateString("en-IN")}</dd>
                      </div>
                      <div>
                        <dt>Evidence integrity</dt>
                        <dd>
                          <span
                            className={
                              att.documentsUnchangedSinceAttestation
                                ? "status registered"
                                : "status cancelled"
                            }
                            style={{ display: "inline-block", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                          >
                            {att.documentsUnchangedSinceAttestation
                              ? "✓ Documents unchanged since verification"
                              : "⚠ Documents changed since verification"}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
                <div className="integrity-note">
                  This record is verified against the Drunix ledger. Your institution decides whether to accept it under internal risk policy.
                </div>
              </div>
            )}

            {searched && attestations.length === 0 && (
              <p style={{ padding: "2rem 0", textAlign: "center" }}>
                No active attestations found on Drunix for this business profile.
              </p>
            )}
          </section>

          <aside className="lookup-boundary">
            <p className="kicker">Privacy boundary (I-3 &amp; D-8)</p>
            <h2>Evidence, not another bank&apos;s private file.</h2>
            <ul>
              <li>Authoritative issuer identity &amp; MSP ID</li>
              <li>Verification type, issuance date, and validity</li>
              <li>Cryptographic document snapshot comparison</li>
            </ul>
            <ul className="blocked">
              <li>Officer KYC review notes or checklist</li>
              <li>Underlying risk work or proprietary assessments</li>
              <li>Original document bytes (requires separate DOCUMENTS consent)</li>
            </ul>
            <Link className="light-button" href="/institution/requests/new" style={{ marginTop: "1.5rem", display: "inline-block" }}>
              Request document access →
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

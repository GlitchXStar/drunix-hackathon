"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

export default function ProfilePage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (user?.businessId) {
      api.getBusinessProfile().then((data) => {
        if (!cancelled) setProfile(data);
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [user?.businessId]);

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · profile information stays private until you consent
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / profile</p>
            <h1>Business profile</h1>
            <p>Your registered business identity and verification context on TrustLedger.</p>
          </div>
          <span className="status registered">ACTIVE ACCOUNT</span>
        </header>

        <section className="profile-layout">
          <section className="profile-form">
            <fieldset>
              <legend>01 · Registered business details</legend>
              <div className="form-grid">
                <div>
                  <label htmlFor="legal-name">Legal business name</label>
                  <input
                    id="legal-name"
                    value={profile?.legalName || user?.businessName || (profile ? "—" : "Loading...")}
                    readOnly
                  />
                </div>
                <div>
                  <label htmlFor="business-type">Business type</label>
                  <input
                    id="business-type"
                    value={profile?.businessType || (profile ? "—" : "Loading...")}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label htmlFor="gstin">GSTIN</label>
                  <input
                    id="gstin"
                    value={profile?.gstin || (profile ? "Not provided" : "Loading...")}
                    readOnly
                  />
                </div>
                <div>
                  <label htmlFor="pan">Business PAN</label>
                  <input
                    id="pan"
                    value={profile?.pan || (profile ? "Not provided" : "Loading...")}
                    readOnly
                  />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>02 · Account &amp; Drunix reference</legend>
              <div className="form-grid">
                <div>
                  <label htmlFor="owner-email">Owner account email</label>
                  <input
                    id="owner-email"
                    value={user?.email || "—"}
                    readOnly
                  />
                </div>
                <div>
                  <label htmlFor="business-id">Internal business ID</label>
                  <input
                    id="business-id"
                    value={user?.businessId || profile?.id || "—"}
                    readOnly
                  />
                </div>
              </div>
              <div>
                <label htmlFor="role">Assigned role</label>
                <input
                  id="role"
                  value={user?.role || "BUSINESS_OWNER"}
                  readOnly
                />
              </div>
            </fieldset>
          </section>

          <aside className="profile-integrity">
            <p className="kicker">Verification context</p>
            <h2>Consent-controlled privacy</h2>
            <div className="profile-status">
              <span className="status registered">PRIVACY SHIELD ACTIVE</span>
              <p>Your business profile and identifiers are never exposed publicly on the blockchain (Invariant I-3).</p>
            </div>
            <div className="changed-item" style={{ marginTop: "1rem" }}>
              <strong>Document Vault</strong>
              <small>Manage encrypted documents and cryptographic hashes.</small>
              <Link href="/business/documents" className="table-link">
                Go to document vault →
              </Link>
            </div>
            <div className="profile-status" style={{ marginTop: "1rem" }}>
              <strong>Share codes</strong>
              <p>Generate a time-limited 8-character share code to let an institution look up your profile.</p>
              <Link href="/business/share-codes" className="table-link">
                Create share code →
              </Link>
            </div>
          </aside>
        </section>

        <section className="profile-footnote">
          <p className="kicker">Profile updates and verification</p>
          <h2>Changes are cryptographically reflected.</h2>
          <p>
            When you replace an uploaded document, TrustLedger updates the on-chain SHA-256 hash. Existing attestations flag whether evidence has changed since verification.
          </p>
        </section>
      </section>
    </main>
  );
}

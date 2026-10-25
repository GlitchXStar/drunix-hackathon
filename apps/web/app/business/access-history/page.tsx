"use client";

import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function AccessHistoryPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const { data: consents, loading, error } = useApi(() => api.listBusinessConsents());

  const items = consents || [];

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · immutable access events and consent lifecycle
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / audit trail</p>
            <h1>Access &amp; consent history</h1>
            <p>Every consented profile or evidence release is recorded here for your review.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Notice</strong>
            {error}
          </div>
        )}

        <section className="access-history-card">
          <div className="section-card-head">
            <div>
              <p className="kicker">Recorded consent releases</p>
              <h2>Authorized institution access grants</h2>
            </div>
            <span>{loading ? "Loading…" : `${items.length} events`}</span>
          </div>
          {items.map((grant) => (
            <article key={grant.id}>
              <time>{new Date(grant.createdAt).toLocaleString("en-IN")}</time>
              <div>
                <strong>Institution {grant.institutionId || "Bank"} granted {grant.scopeType} access</strong>
                <p>
                  Scope: {grant.approvedDocRefs?.join(", ") || "Profile scope only"} · Expires{" "}
                  {new Date(grant.expiresAt).toLocaleString("en-IN")}
                </p>
              </div>
              <span className={grant.status === "ACTIVE" ? "status registered" : "status expired"}>
                {grant.status}
              </span>
              <code>0x{grant.consentId.replace(/-/g, "").slice(0, 8)}…</code>
            </article>
          ))}
          {!loading && items.length === 0 && (
            <p style={{ padding: "2rem", textAlign: "center" }}>
              No access grants recorded yet.
            </p>
          )}
          <div className="audit-disclosure">
            Events are logged when access is authorized or initiated. This audit history reports TrustLedger session activity; it cannot determine whether an institution retained an authorized copy after download.
          </div>
        </section>
      </section>
    </main>
  );
}

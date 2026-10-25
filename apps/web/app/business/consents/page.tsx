"use client";

import { useState, useCallback } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function ConsentsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const { data: consents, loading, error, refetch } = useApi(() => api.listBusinessConsents());
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRevoke = useCallback(async (id: string) => {
    if (!confirm("Revoke this consent? This will immediately terminate all active sessions and deny future access.")) return;
    setActionError(null);
    setRevoking(id);
    try {
      await api.revokeConsent(id);
      refetch();
    } catch (err: any) {
      setActionError(err?.message || "Failed to revoke consent.");
    } finally {
      setRevoking(null);
    }
  }, [refetch]);

  const items = consents || [];

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · consent revocation is immediate and logged
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / consents</p>
            <h1>Consent grants</h1>
            <p>Active and historical consent grants given to institutions.</p>
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
              <p className="kicker">Consent grants</p>
              <h2>Your consent history</h2>
            </div>
            <span className="vault-count">
              {loading ? "Loading…" : `${items.length} consents`}
            </span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Consent</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((consent) => (
                  <tr key={consent.id}>
                    <td>
                      <strong>{consent.consentId.slice(0, 8)}…</strong>
                      <small>
                        Created {new Date(consent.createdAt).toLocaleDateString("en-IN")}
                      </small>
                    </td>
                    <td>{consent.scopeType}</td>
                    <td>
                      <span
                        className={
                          consent.status === "ACTIVE"
                            ? "status registered"
                            : consent.status === "REVOKED"
                            ? "status expired"
                            : "status pending"
                        }
                      >
                        {consent.status}
                      </span>
                    </td>
                    <td>
                      {consent.expiresAt
                        ? new Date(consent.expiresAt).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                    <td>
                      {consent.status === "ACTIVE" && (
                        <button
                          className="light-button"
                          disabled={revoking === consent.id}
                          onClick={() => handleRevoke(consent.id)}
                        >
                          {revoking === consent.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                      {consent.status !== "ACTIVE" && <span>—</span>}
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                      No consent grants yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

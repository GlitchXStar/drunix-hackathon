"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function RequestsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");
  const { data: requests, loading, error, refetch } = useApi(() => api.listInstitutionRequests());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCancel = useCallback(async (id: string) => {
    setActionError(null);
    setCancellingId(id);
    try {
      await api.cancelInstitutionRequest(id);
      refetch();
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel request.");
    } finally {
      setCancellingId(null);
    }
  }, [refetch]);

  const items = requests || [];

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · request availability is determined by current consent
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">KYC Officer / verification desk</p>
            <h1>Verification requests</h1>
            <p>Track purpose-bound requests and open sessions only after the owner&apos;s consent is active.</p>
          </div>
          <Link className="dark-button" href="/institution/requests/new">
            New request <span>→</span>
          </Link>
        </header>

        {(error || actionError) && (
          <div className="admin-alert" role="alert">
            <strong>{error?.includes("Session expired") || error?.includes("session required") ? "Session Notice" : "Error"}</strong>
            {error || actionError}
            {(error?.includes("Session expired") || error?.includes("session required")) && (
              <div style={{ marginTop: "0.75rem" }}>
                <Link className="dark-button" href="/login?reason=session_expired" style={{ display: "inline-block" }}>
                  Sign in again →
                </Link>
              </div>
            )}
          </div>
        )}

        <section className="officer-table-card">
          <div className="section-card-head">
            <div>
              <p className="kicker">Institution queue</p>
              <h2>Current requests</h2>
            </div>
            <span>{loading ? "Loading…" : `${items.length} records`}</span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Scope & Purpose</th>
                  <th>Status</th>
                  <th>Requested Documents</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <strong>{req.id.slice(0, 8)}…</strong>
                      <small>{new Date(req.createdAt).toLocaleDateString("en-IN")}</small>
                    </td>
                    <td>
                      <strong>{req.scopeType}</strong>
                      <small>{req.purposeCode}</small>
                    </td>
                    <td>
                      <span
                        className={
                          req.status === "APPROVED"
                            ? "status registered"
                            : req.status === "REJECTED" || req.status === "CANCELLED"
                            ? "status expired"
                            : "status pending"
                        }
                      >
                        {req.status}
                      </span>
                    </td>
                    <td>{req.requestedDocTypes?.join(", ") || "—"}</td>
                    <td>
                      {req.status === "PENDING" && (
                        <button
                          className="light-button"
                          disabled={cancellingId === req.id}
                          onClick={() => handleCancel(req.id)}
                        >
                          {cancellingId === req.id ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                      {req.status === "APPROVED" && (
                        <Link className="table-link" href="/institution/session-activation">
                          Activate session →
                        </Link>
                      )}
                      {req.status !== "PENDING" && req.status !== "APPROVED" && (
                        <span className="table-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                      No verification requests found. Create one with &quot;New request&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="activation-notice">
          <strong>Consent boundary:</strong> request status alone does not grant document access. A separate officer OTP activates a restricted session for the approved scope.
        </section>
      </section>
    </main>
  );
}

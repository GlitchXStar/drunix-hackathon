"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi, useMutation } from "../../lib/hooks";
import * as api from "../../lib/api";
import type { DocumentRecord } from "../../lib/api";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const { data: documents, loading, error, refetch } = useApi(() => api.listDocuments());
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("GST_CERTIFICATE");
  const upload = useMutation(api.uploadDocument);
  const retry = useMutation(api.retryDocRegistration);
  const remove = useMutation(api.deleteDocument);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      await upload.execute(file, uploadDocType);
      if (fileRef.current) fileRef.current.value = "";
      refetch();
    } catch { /* error shown via upload.error */ }
  }, [upload, uploadDocType, refetch]);

  const handleRetry = useCallback(async (id: string) => {
    await retry.execute(id);
    refetch();
  }, [retry, refetch]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this document? This action uses crypto-shredding and cannot be undone.")) return;
    await remove.execute(id);
    refetch();
  }, [remove, refetch]);

  const docs: DocumentRecord[] = documents || [];
  const registeredCount = docs.filter((d) => d.status === "REGISTERED").length;

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · do not upload real documents
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / records</p>
            <h1>Document vault</h1>
            <p>Encrypted documents registered for consent-based sharing.</p>
          </div>
          <Link href="/business/documents/upload" className="dark-button">
            Upload document <span>+</span>
          </Link>
        </header>

        <div className="vault-summary">
          <article>
            <span>ENCRYPTED BEFORE STORAGE</span>
            <strong>Documents stay private by default.</strong>
            <p>
              Files are stored outside the ledger; only integrity evidence is
              registered.
            </p>
          </article>
          <article>
            <span>SHAREABLE STATUS</span>
            <strong>REGISTERED required before sharing.</strong>
            <p>
              Retry any document that remains pending registration.
            </p>
          </article>
        </div>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Error loading documents</strong>
            {error}
          </div>
        )}

        <section className="vault-card">
          <div className="vault-card-head">
            <div>
              <p className="kicker">Registered files</p>
              <h2>Your business documents</h2>
            </div>
            <span className="vault-count">
              {loading ? "Loading…" : `${docs.length} records · ${registeredCount} registered`}
            </span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Version / state</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <strong>{doc.docType.replace(/_/g, " ")}</strong>
                      <small>
                        {doc.mime} · {formatDate(doc.createdAt)} · {formatBytes(doc.sizeBytes)}
                      </small>
                    </td>
                    <td>
                      <span
                        className={
                          doc.status === "REGISTERED"
                            ? "status registered"
                            : doc.status === "DELETED"
                            ? "status expired"
                            : "status pending"
                        }
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td>v{doc.version}</td>
                    <td>
                      <button
                        onClick={async () => {
                          const blob = await api.viewOwnDocument(doc.id);
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        }}
                      >
                        View
                      </button>
                      {doc.status === "PENDING_REGISTRATION" && (
                        <button onClick={() => handleRetry(doc.id)}>
                          Retry
                        </button>
                      )}
                      {doc.status === "REGISTERED" && (
                        <button onClick={() => handleDelete(doc.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && docs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>
                      No documents yet. Upload your first document below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="vault-lower">
          <div className="drop-zone">
            <span>↑</span>
            <h2>Add a document</h2>
            <p>Choose a file to upload.</p>

            {(upload.error || retry.error || remove.error) && (
              <div className="admin-alert" role="alert">
                <strong>Error</strong>
                {upload.error || retry.error || remove.error}
              </div>
            )}

            <select
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
              style={{ marginBottom: "0.75rem" }}
            >
              <option value="GST_CERTIFICATE">GST Certificate</option>
              <option value="BANK_STATEMENT">Bank Statement</option>
              <option value="REGISTRATION_CERTIFICATE">Registration Certificate</option>
              <option value="ANNUAL_RETURN">Annual Return</option>
              <option value="PAN_CARD">PAN Card</option>
              <option value="OTHER">Other</option>
            </select>

            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" />
            <button
              className="light-button"
              onClick={handleUpload}
              disabled={upload.loading}
              style={{ marginTop: "0.75rem" }}
            >
              {upload.loading ? "Uploading…" : "Upload file"}
            </button>
            <small>
              PDF, PNG or JPEG · up to 10 MB · server validation occurs before
              encryption and ledger registration.
            </small>
          </div>
          <aside className="sharing-status">
            <p className="kicker">Sharing status</p>
            <h2>Control what becomes available.</h2>
            <p>
              Only documents marked <strong>REGISTERED</strong> can be attached
              to a consented request. Pending records remain private.
            </p>
            <Link href="/business/share-codes">Manage share codes →</Link>
          </aside>
        </section>
      </section>
    </main>
  );
}

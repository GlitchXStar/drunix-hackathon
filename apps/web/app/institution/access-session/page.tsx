"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import * as api from "../../lib/api";

function AccessSessionContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [sessionId, setSessionId] = useState(searchParams.get("sessionId") || "");
  const [sessionActive, setSessionActive] = useState(false);
  const [documents, setDocuments] = useState<api.DocumentRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<api.DocumentRecord | null>(null);
  const [viewingBlobUrl, setViewingBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadDocuments = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const docs = await api.getSessionDocuments(id.trim());
      setDocuments(docs);
      setSessionActive(true);
      if (docs.length > 0) {
        setSelectedDoc((prev) => prev || docs[0]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load session documents. Verify the session is ACTIVE.");
      setSessionActive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const paramId = searchParams.get("sessionId");
    if (paramId) {
      setSessionId(paramId);
      loadDocuments(paramId);
    }
  }, [searchParams, loadDocuments]);

  const handleViewPage = useCallback(async (doc: api.DocumentRecord) => {
    setError(null);
    setSelectedDoc(doc);
    try {
      const blob = await api.viewDocumentPage(sessionId, doc.docRef, 1);
      if (viewingBlobUrl) URL.revokeObjectURL(viewingBlobUrl);
      const url = URL.createObjectURL(blob);
      setViewingBlobUrl(url);
    } catch (err: any) {
      setError(err?.message || "Failed to render document page.");
    }
  }, [sessionId, viewingBlobUrl]);

  const handleDownload = useCallback(async (doc: api.DocumentRecord) => {
    setError(null);
    try {
      const blob = await api.downloadSessionDocument(sessionId, doc.docRef);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.docRef}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download not permitted or session expired.");
    }
  }, [sessionId]);

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      await api.closeSession(sessionId);
      setSessionActive(false);
      setDocuments([]);
      setSelectedDoc(null);
      if (viewingBlobUrl) URL.revokeObjectURL(viewingBlobUrl);
      setViewingBlobUrl(null);
      setStatusMessage("Session closed successfully. Audit event recorded.");
    } catch (err: any) {
      setError(err?.message || "Failed to close session.");
    }
  }, [sessionId, viewingBlobUrl]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · view-only access is logged and time-bound
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Consented session</p>
            <h1>Document access session</h1>
            <p>View approved evidence within the owner-approved scope and audit boundary.</p>
          </div>
          <span className={sessionActive ? "status registered" : "status pending"}>
            {sessionActive ? "SESSION ACTIVE" : "AWAITING ACTIVE SESSION"}
          </span>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Notice</strong>
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="admin-alert" role="status" style={{ borderColor: "var(--color-registered)" }}>
            <strong>Status</strong>
            {statusMessage}
          </div>
        )}

        {!sessionActive && (
          <section className="officer-table-card" style={{ marginBottom: "2rem" }}>
            <div className="section-card-head">
              <div>
                <p className="kicker">Connect to session</p>
                <h2>Enter active AccessSession ID</h2>
              </div>
            </div>
            <div className="input-group" style={{ padding: "0 1.5rem 1.5rem", margin: 0 }}>
              <input
                type="text"
                placeholder="Paste your activated session ID"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
              <button
                className="dark-button"
                onClick={() => loadDocuments(sessionId)}
                disabled={loading || !sessionId.trim()}
              >
                {loading ? "Loading…" : "Connect to session →"}
              </button>
            </div>
            <p style={{ padding: "0 1.5rem 1.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
              Need to activate a session? Go to{" "}
              <Link href="/institution/session-activation" className="table-link">
                Session Activation
              </Link>
              .
            </p>
          </section>
        )}

        {sessionActive && (
          <>
            <section className="session-banner">
              <div>
                <strong>Watermarked access environment</strong>
                <p>
                  Session: <code>{sessionId}</code> · Every page view is audit-logged and watermarked with your officer ID.
                </p>
              </div>
              <button className="text-button" onClick={handleEndSession}>
                End session
              </button>
            </section>

            <div className="access-layout">
              <section className="document-viewer" onContextMenu={(e) => e.preventDefault()}>
                <div className="viewer-toolbar">
                  <span>{selectedDoc?.docRef || "Select a document"}</span>
                  <span>{selectedDoc?.docType || "View-only"}</span>
                </div>
                {viewingBlobUrl ? (
                  <div style={{ height: "450px", overflow: "hidden", display: "flex", justifyContent: "center" }}>
                    <iframe
                      src={viewingBlobUrl}
                      title="Watermarked Document"
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                ) : (
                  <div className="document-placeholder" aria-label="Watermarked document preview">
                    <div className="watermark">TRUSTLEDGER · SESSION BOUND</div>
                    <p>{selectedDoc?.docType || "Select a document to view"}</p>
                    <h2>{selectedDoc?.docRef || "—"}</h2>
                    <div className="document-lines">
                      <i /><i /><i /><i /><i />
                    </div>
                    {selectedDoc && (
                      <button
                        className="dark-button"
                        style={{ marginTop: "1rem" }}
                        onClick={() => handleViewPage(selectedDoc)}
                      >
                        Render page 1 with watermark →
                      </button>
                    )}
                  </div>
                )}
                <div className="viewer-footer">
                  <span>Page 1 of 1</span>
                  <span>
                    Hash root: <code>{selectedDoc?.contentHash?.slice(0, 16) || "—"}…</code>
                  </span>
                </div>
              </section>

              <aside className="session-details">
                <p className="kicker">Session controls</p>
                <h2>Approved files ({documents.length})</h2>
                {documents.map((doc) => (
                  <article key={doc.id}>
                    <strong>{doc.docType}</strong>
                    <small>{doc.docRef}</small>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <button
                        className="light-button"
                        onClick={() => handleViewPage(doc)}
                      >
                        {selectedDoc?.id === doc.id ? "Viewing" : "Open"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => handleDownload(doc)}
                      >
                        Download
                      </button>
                    </div>
                  </article>
                ))}
                {documents.length === 0 && (
                  <p style={{ padding: "1rem 0" }}>No approved documents found in this session.</p>
                )}

                <div style={{ marginTop: "1.5rem" }}>
                  <Link
                    className="dark-button"
                    style={{ width: "100%", textAlign: "center", display: "block" }}
                    href={`/institution/kyc-review`}
                  >
                    Proceed to KYC review →
                  </Link>
                </div>
              </aside>
            </div>
          </>
        )}

        <p className="session-warning" style={{ marginTop: "2rem" }}>
          The owner can revoke consent at any time. Revocation ends future TrustLedger access immediately.
        </p>
      </section>
    </main>
  );
}

export default function AccessSessionPage() {
  return (
    <Suspense fallback={<div>Loading access session…</div>}>
      <AccessSessionContent />
    </Suspense>
  );
}

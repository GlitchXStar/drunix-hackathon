"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import AppSidebar from "../../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../../lib/auth-context";
import * as api from "../../../lib/api";

const DOC_TYPES = [
  { value: "GST_CERTIFICATE", label: "GST Certificate (GSTIN registration)" },
  { value: "INCORPORATION_CERTIFICATE", label: "Certificate of Incorporation / Registration" },
  { value: "BANK_STATEMENT", label: "Bank Statement (6 months)" },
  { value: "FINANCIAL_STATEMENT", label: "Audited Financial Statement" },
  { value: "PAN_CARD", label: "Business PAN Card" },
  { value: "UDYAM_REGISTRATION", label: "Udyam MSME Registration" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function UploadPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("GST_CERTIFICATE");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<api.DocumentRecord | null>(null);

  const validateAndSetFile = (file: File) => {
    setError(null);
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Unsupported file format. Only PDF, PNG, and JPEG files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds 10 MB limit.");
      return;
    }
    setSelectedFile(file);
    setUploadedDoc(null);
    setStep(1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setError("Please select a file to upload.");
      return;
    }
    setError(null);
    setUploading(true);
    setStep(2);

    try {
      // Step 2: Encrypting and uploading to server
      const result = await api.uploadDocument(selectedFile, docType);
      // Step 3: Registration on Drunix
      setStep(3);
      setUploadedDoc(result);
    } catch (err: any) {
      setError(err?.message || "Document upload failed. Ensure you are signed in and backend is active.");
      setStep(1);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, docType]);

  const handleReset = () => {
    setSelectedFile(null);
    setUploadedDoc(null);
    setError(null);
    setStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · files are validated and envelope-encrypted before storage
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Document vault / upload</p>
            <h1>Add a document</h1>
            <p>Upload a business document and track its encrypted registration state.</p>
          </div>
          <Link className="light-button" href="/business/documents">
            Back to vault
          </Link>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Upload Notice</strong>
            {error}
          </div>
        )}

        <section className="upload-layout">
          <section className="upload-workflow">
            {/* Step 1: Selection */}
            <div className={`upload-state ${step === 1 ? "active" : ""}`}>
              <span>01</span>
              <div>
                <strong>Select document</strong>
                <p>Choose a PDF, PNG or JPEG up to 10 MB.</p>
              </div>
              {step === 1 && <em>Current</em>}
              {step > 1 && <em>✓ Done</em>}
            </div>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {/* Dropzone & File Configuration */}
            {!uploadedDoc && (
              <div
                className="upload-drop"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: dragActive ? "2px dashed var(--color-brand)" : undefined,
                  backgroundColor: dragActive ? "rgba(255, 255, 255, 0.05)" : undefined,
                  transition: "all 0.2s ease",
                }}
              >
                <span>↑</span>
                <h2>{selectedFile ? selectedFile.name : "Drop a document here"}</h2>
                <p>
                  {selectedFile
                    ? `${formatBytes(selectedFile.size)} · ${selectedFile.type || "Document"}`
                    : "or choose a file from your device"}
                </p>

                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="light-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {selectedFile ? "Change file" : "Choose file"}
                  </button>

                  {selectedFile && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={handleReset}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {selectedFile && (
                  <div style={{ marginTop: "1.5rem", maxWidth: "400px", margin: "1.5rem auto 0", textAlign: "left" }}>
                    <label htmlFor="docTypeSelect" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 600 }}>
                      Document Classification Type:
                    </label>
                    <select
                      id="docTypeSelect"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      disabled={uploading}
                      style={{ width: "100%", padding: "0.6rem", borderRadius: "6px" }}
                    >
                      {DOC_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>
                          {dt.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ marginTop: "1rem", textAlign: "center" }}>
                      <button
                        type="button"
                        className="dark-button"
                        onClick={handleUpload}
                        disabled={uploading}
                        style={{ width: "100%", padding: "0.75rem" }}
                      >
                        {uploading ? "Encrypting & uploading…" : "Upload and encrypt document →"}
                      </button>
                    </div>
                  </div>
                )}

                <small style={{ display: "block", marginTop: "1rem" }}>
                  Allowed: PDF, PNG, JPEG · server checks file type, size and content signature before processing.
                </small>
              </div>
            )}

            {/* Success Card when completed */}
            {uploadedDoc && (
              <div className="admin-alert" role="status" style={{ borderColor: "var(--color-registered)", margin: "1.5rem 0" }}>
                <strong>✓ Document Registered Successfully</strong>
                <p>
                  Reference: <code>{uploadedDoc.docRef}</code> · Type: <strong>{uploadedDoc.docType}</strong>
                </p>
                <p>
                  Status: <span className="status registered">{uploadedDoc.status}</span> · SHA-256 Root:{" "}
                  <code>{uploadedDoc.contentHash?.slice(0, 20)}…</code>
                </p>
                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                  <Link className="dark-button" href="/business/documents">
                    View in document vault →
                  </Link>
                  <button type="button" className="light-button" onClick={handleReset}>
                    Upload another document
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Encryption */}
            <div className={`upload-state ${step === 2 ? "active" : ""}`}>
              <span>02</span>
              <div>
                <strong>Encrypt and store</strong>
                <p>The server encrypts a validated file before storage with AES-256-GCM envelope encryption.</p>
              </div>
              {step === 2 && <em>Processing…</em>}
              {step === 3 && <em>✓ Done</em>}
            </div>

            {/* Step 3: Registration */}
            <div className={`upload-state ${step === 3 ? "active" : ""}`}>
              <span>03</span>
              <div>
                <strong>Register integrity record</strong>
                <p>The file becomes shareable only after <code>REGISTERED</code> status on Drunix.</p>
              </div>
              {step === 3 && <em>✓ Registered</em>}
            </div>
          </section>

          <aside className="upload-side">
            <p className="kicker">Registration states</p>
            <h2>Private by default.</h2>
            <dl>
              <div>
                <dt>PENDING_REGISTRATION</dt>
                <dd>Not shareable yet</dd>
              </div>
              <div>
                <dt>REGISTERED</dt>
                <dd>Eligible for consented sharing</dd>
              </div>
              <div>
                <dt>REPLACED</dt>
                <dd>Previous version retained in audit history</dd>
              </div>
              <div>
                <dt>DELETED</dt>
                <dd>Removed from future availability (crypto-shredded)</dd>
              </div>
            </dl>
            <p>Upload does not automatically share a document or grant any institution access.</p>
          </aside>
        </section>

        <section className="upload-security-note">
          <strong>Security boundary:</strong> Do not upload real personal or financial data in this prototype. Production processing must keep files, OTPs and document data out of browser storage.
        </section>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "../../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../../lib/auth-context";
import * as api from "../../../lib/api";

const DOC_TYPES = [
  { id: "GST_CERTIFICATE", label: "GST Certificate" },
  { id: "BANK_STATEMENT", label: "Bank Statement (6 months)" },
  { id: "REGISTRATION_CERTIFICATE", label: "Registration / Incorporation Certificate" },
  { id: "PAN", label: "Business PAN" },
  { id: "UDYAM_CERTIFICATE", label: "Udyam Registration" },
];

export default function NewRequestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [businessId, setBusinessId] = useState("65f000000000000000000042");
  const [scopeType, setScopeType] = useState<"DOCUMENTS" | "FEATURES">("DOCUMENTS");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([
    "GST_CERTIFICATE",
    "REGISTRATION_CERTIFICATE",
  ]);
  const [purposeCode, setPurposeCode] = useState("KYC_VERIFICATION");
  const [durationHours, setDurationHours] = useState("24");
  const [allowDownload, setAllowDownload] = useState(false);
  const [message, setMessage] = useState("Please provide verification documents for KYC check.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleDoc = (docId: string) => {
    setSelectedDocs((prev) =>
      prev.includes(docId) ? prev.filter((d) => d !== docId) : [...prev, docId],
    );
  };

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!businessId.trim()) {
      setError("Please specify a target business ID.");
      return;
    }
    if (scopeType === "DOCUMENTS" && selectedDocs.length === 0) {
      setError("Select at least one document type.");
      return;
    }

    setLoading(true);
    try {
      const minutes = parseInt(durationHours, 10) * 60;
      await api.createInstitutionRequest({
        businessId: businessId.trim(),
        scopeType,
        requestedDocTypes: scopeType === "DOCUMENTS" ? selectedDocs : undefined,
        purposeCode,
        requestedDurationMinutes: minutes,
        allowDownload,
        message: message.trim() || undefined,
      });
      setSuccess("Access request created and sent to business owner.");
      setTimeout(() => {
        router.push("/institution/requests");
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to create access request.");
    } finally {
      setLoading(false);
    }
  }, [businessId, scopeType, selectedDocs, purposeCode, durationHours, allowDownload, message, router]);

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · sending a request does not guarantee access
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Institutional desk / KYC verification</p>
            <h1>Request verification from an MSME</h1>
            <p>Draft a purpose-limited evidence request. The business owner controls the final scope.</p>
          </div>
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
            <div className="non-guarantee">
              Sending a request never guarantees document disclosure, access approval, or an automated loan outcome.
            </div>

            <fieldset>
              <legend>01 · Target MSME business</legend>
              <label htmlFor="business-id">Business ID</label>
              <input
                id="business-id"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="e.g. 65f000000000000000000042 (Acme Textiles)"
              />
              <p className="field-intro">
                Tip: After redeeming a share code on the profile lookup page, you receive the business ID.
              </p>
            </fieldset>

            <fieldset>
              <legend>02 · Scope and purpose</legend>
              <label htmlFor="scope-type">Scope type</label>
              <select
                id="scope-type"
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as "DOCUMENTS" | "FEATURES")}
              >
                <option value="DOCUMENTS">DOCUMENTS (Document viewing)</option>
                <option value="FEATURES">FEATURES (Structured financial features)</option>
              </select>

              <label htmlFor="request-purpose">Stated institutional purpose</label>
              <select
                id="request-purpose"
                value={purposeCode}
                onChange={(e) => setPurposeCode(e.target.value)}
              >
                <option value="KYC_VERIFICATION">KYC_VERIFICATION · Regulatory identity & compliance check</option>
                <option value="LOAN_APPRAISAL">LOAN_APPRAISAL · Credit underwriting & assessment</option>
              </select>

              <label htmlFor="request-expiry">Proposed validity</label>
              <select
                id="request-expiry"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              >
                <option value="24">24 hours (standard)</option>
                <option value="48">48 hours</option>
                <option value="168">7 days (168 hours)</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                />
                Request download permission (subject to explicit owner approval)
              </label>
            </fieldset>

            {scopeType === "DOCUMENTS" && (
              <fieldset>
                <legend>03 · Requested evidence types</legend>
                <div className="evidence-checks">
                  {DOC_TYPES.map((dt) => (
                    <label key={dt.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(dt.id)}
                        onChange={() => toggleDoc(dt.id)}
                      />
                      {dt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend>04 · Message to owner</legend>
              <input
                id="request-message"
                value={message}
                maxLength={280}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional note explaining the request purpose..."
              />
            </fieldset>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button
                className="dark-button"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Submitting…" : "Send verification request →"}
              </button>
              <Link className="light-button" href="/institution/requests">
                Cancel
              </Link>
            </div>
          </section>

          <aside className="recipient-preview">
            <p className="kicker">What the MSME owner sees</p>
            <h2>A transparent request.</h2>
            <p>The owner sees your institution, stated purpose, proposed validity, and every requested document before selectively approving access.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}

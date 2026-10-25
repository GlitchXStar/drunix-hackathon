# TrustLedger Backend API Contract (v1)

Authoritative specification for `backend/api`. Base path: `/api/v1`. Authentication via server-side session cookie (`HttpOnly`, `SameSite=Lax`).

## 1. Conventions

### Error Format
All error responses adhere to:
```json
{
  "code": "ERROR_CODE_STRING",
  "message": "Human readable message",
  "requestId": "req-uuid"
}
```

### Access Denial Reason Codes
- `CONSENT_NOT_FOUND`
- `CONSENT_EXPIRED`
- `CONSENT_REVOKED`
- `INSTITUTION_MISMATCH`
- `INSTITUTION_SUSPENDED`
- `SCOPE_MISMATCH`
- `DOC_NOT_IN_SCOPE`
- `SESSION_EXPIRED`
- `SESSION_NOT_ACTIVE`
- `FINGERPRINT_MISMATCH`
- `INTEGRITY_MISMATCH`
- `LEDGER_UNAVAILABLE`

### Idempotency
All mutation endpoints triggering Drunix writes accept an `Idempotency-Key` header. Repeated calls with the same key return the cached first response without re-submitting ledger transactions.

---

## 2. Endpoints Summary

| Method & Path | Roles Allowed | Description & Protocol |
| :--- | :--- | :--- |
| `POST /auth/login` | Public | Authenticates credentials, sets session cookie |
| `POST /auth/logout` | Authenticated | Revokes session server-side |
| `GET /auth/me` | Authenticated | Retrieves current user & tenant profile |
| `POST /auth/change-password` | Authenticated | First-login or requested password change |
| `POST /business/register` | Public | Self-onboards MSME business & owner |
| `GET /business/me`, `PATCH /business/me` | `BUSINESS_OWNER` | Manage business profile |
| `GET /business/documents` | `BUSINESS_OWNER`, `BUSINESS_EMPLOYEE` | List uploaded documents |
| `POST /business/documents` | `BUSINESS_OWNER`, `BUSINESS_EMPLOYEE` | Upload document (`multipart/form-data`) |
| `POST /business/documents/:id/retry-registration` | `BUSINESS_OWNER`, `BUSINESS_EMPLOYEE` | Retry ledger registration for PENDING_REGISTRATION document |
| `PUT /business/documents/:id` | `BUSINESS_OWNER` | Replace document version (blocked if active consent) |
| `DELETE /business/documents/:id` | `BUSINESS_OWNER` | Crypto-shred document (blocked if active consent) |
| `GET /business/documents/:id/view` | `BUSINESS_OWNER` | Owner views own document |
| `POST /business/share-codes` | `BUSINESS_OWNER` | Trigger OTP challenge for profile share code |
| `POST /business/share-codes/:id/confirm` | `BUSINESS_OWNER` | Submit OTP, receive 8-character code (shown once) |
| `GET /business/requests` | `BUSINESS_OWNER` | List incoming document requests |
| `POST /business/requests/:id/otp` | `BUSINESS_OWNER` | Generate approval OTP challenge |
| `POST /business/requests/:id/decision` | `BUSINESS_OWNER` | Approve (with OTP) or reject document request |
| `GET /business/consents` | `BUSINESS_OWNER` | List active grants |
| `POST /business/consents/:id/revoke` | `BUSINESS_OWNER` | Revoke consent grant |
| `GET /business/access-history` | `BUSINESS_OWNER` | View access audit logs |
| `GET /business/attestations` | `BUSINESS_OWNER` | View institution-issued attestations |
| `POST /institution/profile-lookup` | `KYC_OFFICER`, `LOAN_OFFICER` | Redeem 8-char share code for PROFILE consent |
| `GET /institution/consents` | `KYC_OFFICER`, `COMPLIANCE_OFFICER`, `LOAN_OFFICER` | List institution's consents |
| `POST /institution/requests` | `KYC_OFFICER` (docs), `LOAN_OFFICER` (features) | Request documents or features |
| `GET /institution/requests` | Institution roles | List requests made by institution |
| `POST /institution/sessions` | `KYC_OFFICER` | Create access session (`PENDING_OTP`) |
| `POST /institution/sessions/:id/activate` | `KYC_OFFICER` | Activate session with OTP (`ACTIVE`) |
| `POST /institution/sessions/:id/close` | `KYC_OFFICER` | Close active session |
| `GET /institution/sessions/:id/documents` | `KYC_OFFICER` | List approved documents in active session |
| `GET /institution/sessions/:id/documents/:docRef/pages/:page` | `KYC_OFFICER` | Rendered watermarked page (`image/png`) |
| `GET /institution/sessions/:id/documents/:docRef/download` | `KYC_OFFICER` | Download binary (only if approved) |
| `POST /institution/kyc-reviews` | `KYC_OFFICER` | Record private institution KYC checklist & notes |
| `POST /institution/attestations` | `KYC_OFFICER` | Issue `KYC_BASIC` attestation to Drunix |
| `PATCH /institution/attestations/:id/status` | `KYC_OFFICER` | Suspend or revoke own attestation |
| `GET /institution/consents/:consentId/attestations` | `KYC_OFFICER`, `COMPLIANCE_OFFICER`, `LOAN_OFFICER` | Attestation lookup (cross-institution) |
| `POST /institution/financial-profiles` | `LOAN_OFFICER` | Ingest structured 13 financial features |
| `POST /institution/risk-assessments` | `LOAN_OFFICER` | Request draft assessment from ML service |
| `POST /institution/risk-assessments/:id/finalise` | `LOAN_OFFICER` | Submit review note & record ref to Drunix |
| `GET /institution/risk-assessments` | `LOAN_OFFICER`, `COMPLIANCE_OFFICER` | List risk assessments |
| `GET /institution/audit` | `COMPLIANCE_OFFICER`, `INSTITUTION_ADMIN` (scoped) | Institution audit logs |
| `POST /admin/institutions` | `PLATFORM_SUPER_ADMIN` | Onboard new Bank/NBFC institution |
| `GET /admin/institutions` | `PLATFORM_SUPER_ADMIN` | List institutions |
| `PATCH /admin/institutions/:id/status` | `PLATFORM_SUPER_ADMIN` | Activate or suspend institution |
| `POST /admin/institutions/:id/admins` | `PLATFORM_SUPER_ADMIN` | Create institution admin |
| `GET /admin/overview` | `PLATFORM_SUPER_ADMIN` | Health, metrics, lockouts, ledger stats |
| `GET /admin/audit` | `PLATFORM_SUPER_ADMIN` | Platform metadata-only audit events |
| `GET /health` | Internal | System liveness and dependency status |
| `GET /dev/outbox` | Dev/Test only | Development OTP inspection outbox |

---

## 3. Stage 7 Detailed Specifications: KYC Reviews, Attestations & Lookup

### 3.1 Record KYC Review
- **Path:** `POST /api/v1/institution/kyc-reviews`
- **Role:** `KYC_OFFICER`
- **Headers:** `Idempotency-Key` (optional)
- **Request Body (`CreateKycReviewDto`):**
  ```json
  {
    "consentId": "string (UUID)",
    "accessSessionId": "string (UUID)",
    "outcome": "VERIFIED | NOT_VERIFIED | NEEDS_MORE_INFO",
    "checklist": {
      "panVerified": true,
      "gstVerified": true,
      "addressMatched": true
    },
    "notes": "string (confidential review assessment)",
    "docRefsReviewed": ["doc-ref-uuid-1", "doc-ref-uuid-2"]
  }
  ```
- **Validation & Business Rules:**
  - Officer must belong to an active institution (I-5).
  - Session must exist, belong to caller officer, be in `ACTIVE` status, and unexpired.
  - Session consent must match `consentId` and be `ACTIVE`.
  - Every document in `docRefsReviewed` must be in `session.viewedDocRefs` (actually rendered in Stage 6).
  - Private notes and checklist items are stored in MongoDB and NEVER sent to Drunix ledger or exposed in lookup responses.
- **Response (201 Created):**
  ```json
  {
    "reviewId": "string (UUID)",
    "outcome": "VERIFIED",
    "docRefsReviewed": ["doc-ref-uuid-1", "doc-ref-uuid-2"],
    "createdAt": "2026-10-25T14:00:00.000Z",
    "message": "KYC review recorded successfully"
  }
  ```

### 3.2 Issue Verification Attestation
- **Path:** `POST /api/v1/institution/attestations`
- **Role:** `KYC_OFFICER`
- **Headers:** `Idempotency-Key` (optional)
- **Request Body (`IssueAttestationDto`):**
  ```json
  {
    "kycReviewId": "string (UUID)",
    "validityMonths": 12,
    "type": "KYC_BASIC"
  }
  ```
- **Validation & Business Rules:**
  - KycReview must have outcome `VERIFIED`.
  - Review must belong to the caller institution and not already have an associated attestation (duplicate prevention).
  - `docHashSnapshot` is derived strictly from authoritative on-chain SHA-256 hashes of documents viewed in that session.
  - Validity months must be between 1 and 24 (default 12 per SPEC §8.5).
  - Submits `IssueAttestation` to Drunix ledger as the acting institution MSP (I-1 fail closed).
  - Notifies business owner upon issuance.
- **Response (201 Created):**
  ```json
  {
    "attId": "string (UUID)",
    "businessRef": "biz-ref-uuid",
    "type": "KYC_BASIC",
    "status": "VALID",
    "issuedAt": "2026-10-25T14:00:00.000Z",
    "validUntil": "2027-10-25T14:00:00.000Z",
    "docHashSnapshotCount": 2,
    "ledgerTxId": "tx-hash-string",
    "message": "Attestation issued successfully on Drunix"
  }
  ```

### 3.3 Update Attestation Status (Suspend or Revoke)
- **Path:** `PATCH /api/v1/institution/attestations/:id/status`
- **Role:** `KYC_OFFICER`
- **Request Body (`UpdateAttestationStatusDto`):**
  ```json
  {
    "status": "SUSPENDED | REVOKED",
    "reasonCode": "SUSPICIOUS_ACTIVITY_REPORTED"
  }
  ```
- **Validation & Business Rules (D-9):**
  - Caller institution must be the issuer of the attestation.
  - Permitted transitions: `VALID` -> `SUSPENDED`, `VALID` -> `REVOKED`, `SUSPENDED` -> `REVOKED`.
  - Reinstatement (`SUSPENDED` -> `VALID`) is strictly prohibited (must issue new attestation).
  - Transitions from `REVOKED` are rejected (`REVOKED` is terminal).
  - Expired attestations cannot be updated.
  - Submits `UpdateAttestationStatus` on Drunix ledger (I-1 fail closed).
- **Response (200 OK):**
  ```json
  {
    "attId": "string (UUID)",
    "status": "SUSPENDED",
    "reasonCode": "SUSPICIOUS_ACTIVITY_REPORTED",
    "updatedAt": "2026-10-25T14:00:00.000Z",
    "message": "Attestation status successfully updated to SUSPENDED on Drunix"
  }
  ```

### 3.4 Cross-Institution Attestation Lookup
- **Path:** `GET /api/v1/institution/consents/:consentId/attestations`
- **Role:** `KYC_OFFICER`, `COMPLIANCE_OFFICER`, `LOAN_OFFICER`
- **Validation & Privacy Rules (W5, I-1):**
  - Caller institution must be active.
  - Consent grant must be active, unexpired, and have `scopeType: PROFILE`.
  - Submits ledger `CheckAccess(consentId, actingMsp, PROFILE)` first; fails closed if ledger is unreachable.
  - Queries authoritative attestations from Drunix ledger using `GetAttestations`.
  - Calculates dynamic `EXPIRED` status against current timestamp.
  - Computes `documentsUnchangedSinceAttestation`: true ONLY if attestation is `VALID` and every hash in `docHashSnapshot` matches a current, non-deleted, registered document hash for that business.
  - Redaction: response contains ZERO internal review notes, checklists, or officer identifiers.
- **Response (200 OK):**
  ```json
  [
    {
      "attId": "string (UUID)",
      "businessRef": "biz-ref-uuid",
      "issuerInstitution": {
        "id": "inst-bank-a",
        "name": "State Bank of India",
        "type": "BANK",
        "mspId": "BankAOrgMSP"
      },
      "type": "KYC_BASIC",
      "status": "VALID",
      "issuedAt": "2026-10-25T14:00:00.000Z",
      "validUntil": "2027-10-25T14:00:00.000Z",
      "documentsUnchangedSinceAttestation": true
    }
  ]
  ```

### 3.5 MSME Owner Attestation View
- **Path:** `GET /api/v1/business/attestations`
- **Role:** `BUSINESS_OWNER`
- **Response (200 OK):**
  ```json
  [
    {
      "attId": "string (UUID)",
      "businessRef": "biz-ref-uuid",
      "type": "KYC_BASIC",
      "status": "VALID",
      "issuedAt": "2026-10-25T14:00:00.000Z",
      "validUntil": "2027-10-25T14:00:00.000Z",
      "docHashSnapshotCount": 2
    }
  ]
  ```


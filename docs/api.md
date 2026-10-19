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

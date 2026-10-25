# TrustLedger — Automated Security Test Results

> **Rule:** Every security-relevant behavior gets an automated test. Results below are populated strictly by automated test runs.
> **Last Run:** 2026-10-25 (Stage 6 Verification)

| ID | Security Test Scenario | Expected Outcome | Result | Automated Test Suite |
| :--- | :--- | :--- | :--- | :--- |
| S-1 | Cross-tenant document access (Inst B reads Inst A session/consent) | 403 / 404 & audited | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-2 | Document request after session expiry | 403 SESSION_EXPIRED | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-3 | Document request after consent revocation | 403 CONSENT_REVOKED | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-4 | Document request after institution suspension mid-session | 403 INSTITUTION_SUSPENDED | **PASS** | `sessions.service.spec.ts` |
| S-5 | Session URL used from another login session or browser | 403 FINGERPRINT_MISMATCH | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-6 | OTP reuse, OTP for wrong entity, expired OTP, 6th attempt | Rejected & audited | **PASS** | `otp.service.spec.ts`, `sessions.service.spec.ts` |
| S-7 | Super Admin or Inst Admin requests customer document content | 403 Access Denied | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-8 | Ledger unreachable during document request (fail closed) | 403 LEDGER_UNAVAILABLE | **PASS** | `sessions.service.spec.ts` |
| S-9 | Ciphertext tampered in storage | 403 & INTEGRITY_MISMATCH audited | **PASS** | `storage-crypto.spec.ts` |
| S-10 | Share-code brute force attempt | Locked out by rate limit | **PASS** | `consent.service.spec.ts`, `consent.e2e-spec.ts` |
| S-11 | CSRF without token / session fixation | Rejected | **PASS** | `session.guard.spec.ts`, `auth.e2e-spec.ts` |
| S-12 | Mass assignment / role escalation in request payload | Rejected / ignored | **PASS** | `sessions.e2e-spec.ts`, `documents.e2e-spec.ts` |
| S-13 | Malicious upload (wrong magic number, spoofed ext, oversize) | Rejected | **PASS** | `documents.service.spec.ts`, `documents.e2e-spec.ts` |
| S-14 | Replace or delete document under active consent | 409 Conflict (D-12) | **PASS** | `documents.service.spec.ts` |
| S-15 | Document download when not approved (view-only) | 403 Forbidden | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |
| S-16 | Log & audit redaction (no plaintext OTPs, keys, passwords) | Verified clean | **PASS** | `log-redaction.spec.ts` |
| S-17 | Risk service request without internal token | 401 Unauthorized | **PASS** | `backend/risk-service/tests/test_api.py` |
| S-18 | Document requested outside approved docRefs scope | 403 DOC_NOT_IN_SCOPE | **PASS** | `sessions.service.spec.ts`, `sessions.e2e-spec.ts` |

## Summary of Verification Runs
- **Unit Tests:** 122 / 122 passed (`npm test`)
- **Integration Tests:** 19 / 19 passed (`npm run test:integration`)
- **Risk Service Tests:** 2 / 2 passed (`npm run test:risk`)
- **Multi-Org Drunix Simulation:** 3 / 3 orgs passed (`npm run test:drunix`)

# TrustLedger — Automated Security Test Results

> **Rule:** Every security-relevant behavior gets an automated test. Results below are populated strictly by automated test runs.

| ID | Security Test Scenario | Expected Outcome | Result |
| :--- | :--- | :--- | :--- |
| S-1 | Cross-tenant document access (Inst B reads Inst A session/consent) | 403 / 404 & audited | not run |
| S-2 | Document request after session expiry | 403 SESSION_EXPIRED | not run |
| S-3 | Document request after consent revocation | 403 CONSENT_REVOKED | not run |
| S-4 | Document request after institution suspension mid-session | 403 INSTITUTION_SUSPENDED | not run |
| S-5 | Session URL used from another login session or browser | 403 FINGERPRINT_MISMATCH | not run |
| S-6 | OTP reuse, OTP for wrong entity, expired OTP, 6th attempt | Rejected & audited | not run |
| S-7 | Super Admin or Inst Admin requests customer document content | 403 Access Denied | not run |
| S-8 | Ledger unreachable during document request (fail closed) | 403 LEDGER_UNAVAILABLE | not run |
| S-9 | Ciphertext tampered in storage | 403 & INTEGRITY_MISMATCH audited | not run |
| S-10 | Share-code brute force attempt | Locked out by rate limit | not run |
| S-11 | CSRF without token / session fixation | Rejected | not run |
| S-12 | Mass assignment / role escalation in request payload | Rejected / ignored | not run |
| S-13 | Malicious upload (wrong magic number, spoofed ext, oversize) | Rejected | not run |
| S-14 | Replace or delete document under active consent | 409 Conflict (D-12) | not run |
| S-15 | Document download when not approved (view-only) | 403 Forbidden | not run |
| S-16 | Log & audit redaction (no plaintext OTPs, keys, passwords) | Verified clean | not run |
| S-17 | Risk service request without internal token | 401 Unauthorized | not run |
| S-18 | Document requested outside approved docRefs scope | 403 DOC_NOT_IN_SCOPE | not run |

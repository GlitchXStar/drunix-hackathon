# TrustLedger — Project State

## Status
- **Current Phase:** Phase 3: Backend foundation (COMPLETE & VERIFIED)
- **Completed Phases:**
  - Phase 0: Repository and tooling (VERIFIED)
  - Phase 1: Drunix discovery and test network (DISCOVERY COMPLETE; LIVE DOCKER NETWORK DEFERRED)
  - Phase 2: Go chaincode implementation (ALL 13 FUNCTIONS IMPLEMENTED WITH MOCK TEST SUITE; HOST GO RUNTIME DEFERRED)
  - Phase 3: Backend foundation (ALL UNIT & INTEGRATION TESTS PASS, LINT PASS, BUILD PASS)
- **Total Phases:** 12
- **Last Verified:** Phase 3 (Auth, Sessions, Lockout, CSRF, OTP Engine, Policy Matrix, Audit Log, S-16 Redaction: 43 unit tests + 4 e2e tests passing, 0 lint errors, build succeeded).

## Active Workstream
- Stage 3: Backend foundation completed and verified in `backend/api`.
  - Authentication (argon2id, 5-attempt lockout, generic errors).
  - Server-side sessions (30-min sliding idle, 8-hour absolute, session rotation, CSRF token validation).
  - Multi-tenant and I-5 active status enforcement on all routes.
  - OTP engine with DevOutboxProvider, CSPRNG, HMAC-SHA256, 5 attempts, 5-min expiry, single-use, entity binding.
  - Policy module with table-driven route-by-role tests.
  - Audit logging with recursive secret/credential redaction (S-16 verified).
  - Health endpoint (`/health`) and Dev Outbox endpoint (`/api/v1/dev/outbox`).
  - Synthetic database seed script (`prisma/seed.ts`).
- Next Stage: Stage 4 — Ledger service, storage and documents.

## Decisions Log
- See `docs/decisions.md` (D-1 through D-17)


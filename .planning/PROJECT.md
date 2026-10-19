# TrustLedger — Project Definition

## Overview
Consent-based MSME verification, document-sharing, and credit-risk platform on NPCI Drunix.
Single source of truth: `docs/SPEC.md`.

## Architecture
- **Web Frontend:** Next.js (App Router, Tailwind CSS) in `apps/web/`
- **Backend API:** NestJS, TypeScript, Prisma (MongoDB operational store) in `backend/api/`
- **Ledger:** NPCI Drunix, Go chaincode in `backend/chaincode/trustledger/`, Fabric Gateway
- **Storage:** AES-256-GCM envelope encryption via `StorageProvider` (Nextcloud WebDAV / LocalFs)
- **Credit Risk:** FastAPI ML service in `backend/risk-service/` evaluating structured financial features

## Invariants
- **I-1:** Ledger-first access validation (fail closed).
- **I-2:** Database is a projection store; ledger wins on dispute.
- **I-3:** No document bytes, keys, OTPs, or PII on ledger.
- **I-4:** ML service receives only structured features, never documents.
- **I-5:** Access requires authenticated officer of ACTIVE institution.
- **I-6:** Audit record for every material change; secrets redacted.

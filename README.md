# TrustLedger — Consent-Based MSME Verification & Credit Risk Assessment on Drunix

NPCI × Drunix Hackathon · Track: Financial Inclusion
**Tagline:** Verify with trust. Share with consent. Assess risk with evidence.

---

## 1. Project Overview

TrustLedger is a privacy-first platform designed to streamline KYC verification, document sharing, and credit risk assessment for Micro, Small, and Medium Enterprises (MSMEs).

- **Shared Verification Layer:** Reusable verification attestations recorded on NPCI Drunix prevent redundant KYC across financial institutions without leaking internal customer databases.
- **Customer-Controlled Vault:** Businesses upload encrypted documents once into a vault (backed by Nextcloud / LocalFs with AES-256-GCM envelope encryption) and approve granular, time-limited access per institution.
- **Explainable ML Credit Risk Assessment:** Authorized structured financial features are evaluated by an isolated Python FastAPI ML service to provide objective risk scores and SHAP factor contributions. No customer documents or PII are ever sent to an LLM or ML model.

---

## 2. Architecture & Ownership Boundary

```
Browser (Next.js - apps/web/) [Person 1]
    │
    ▼ Calls OpenAPI Contract (/api/v1)
NestJS Backend API (backend/api/) [Person 2]
    ├──► MongoDB (Operational workflow, state projection, audit)
    ├──► StorageProvider (AES-256-GCM envelope encryption -> Nextcloud / LocalFs)
    ├──► LedgerService (Multi-org Fabric Gateway -> Drunix Go Chaincode)
    └──► Risk Service (FastAPI -> validated structured features only)
```

- **Person 1 (Frontend):** Owns `apps/web/` and browser-side Playwright E2E tests.
- **Person 2 (Backend - Me):** Owns `backend/api/`, `backend/chaincode/trustledger/`, `backend/risk-service/`, `infra/`, tests, and the authoritative `docs/api.md`.

---

## 3. Honesty & Disclosure Statements (H-1 to H-8)

1. **H-1 Multi-Org Wallet Prototype:** One backend holds a wallet for each organization (`PlatformOrg`, `BankAOrg`, `NbfcOrg`). In a production deployment, each institution would operate its own independent gateway and node.
2. **H-2 Platform Consent Submission:** `PlatformOrg` records consent on the business's behalf after the backend verifies the owner's OTP. A production design would use approvals cryptographically signed by the business's private key.
3. **H-3 Master Key Management:** The envelope encryption master key is loaded from an environment variable in development. This stands in for a production KMS or HSM.
4. **H-4 Development Outbox for OTP:** OTPs are delivered to an in-memory/database development outbox (`/dev/outbox`). No real SMS or email provider is integrated in this prototype.
5. **H-5 Synthetic Training Data:** The credit risk model is trained on deterministic synthetic data. Its scores and bands do not demonstrate real-world lending accuracy and are explicitly labeled as **SYNTHETIC**.
6. **H-6 Prototype Disclaimer:** The prototype makes no claim of regulatory compliance or production readiness.
7. **H-7 Document Recall Limitation:** Platform access revocation and expiry stop future access through the platform; they cannot recall or delete a copy that an authorized institution previously downloaded.
8. **H-8 Viewer Protection Scope:** Server-rendered watermarks and disabled text selection deter casual copying; they cannot technically prevent screen captures.

---

## 4. Key Commands

- **Install dependencies:** `npm install` at root, and `cd backend/api && npm install`
- **Lint all:** `npm run lint`
- **Unit test all:** `npm test`
- **Integration test:** `npm run test:integration`
- **Start infrastructure:** `docker compose -f infra/docker-compose.yml up -d`
- **Stop infrastructure:** `docker compose -f infra/docker-compose.yml down`
- **Prisma generate:** `npm run prisma:generate` (or `cd backend/api && npm run prisma:generate`)
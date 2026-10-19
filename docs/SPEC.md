# TrustLedger — Project Specification & Agent Build Plan

Version 1.0 · NPCI × Drunix Hackathon (CHL-7007) · Track: Financial Inclusion · Status: build-ready

# Part A — Specification

## 1. Purpose and how to use this document

This is the single source of truth for building TrustLedger, a consent-based MSME verification, document-sharing and credit-risk platform on NPCI Drunix.

- **Part A (sections 1–17)** is the specification.
- **Part B** is the working agreement for the coding agent. Copy it into `AGENTS.md` at Stage 0.
- **Part C** is a sequence of stage prompts. Paste ONE stage at a time. The agent must finish a stage, report, and stop.

Save this file as `docs/SPEC.md` in the repository. MUST, SHOULD and MAY carry their usual meaning. Design decisions are labelled D-n and invariants I-n.

Anything about Drunix itself (commands, ports, client versions, endorsement-policy syntax) that is not written here MUST be discovered from the Drunix repository and documentation in Stage 1 and recorded in `docs/drunix-notes.md`. The agent MUST NOT guess or invent Drunix commands or APIs.

## 2. Scope and non-goals

**In scope (v1)** — one complete journey, working end to end:

1. An MSME registers, creates a business profile and uploads documents.
2. Bank A requests documents for KYC. The MSME approves selected documents and confirms with an OTP. A Bank A officer activates a restricted session with an OTP and views only those documents.
3. The officer records the KYC outcome and issues a verification attestation to Drunix.
4. The officer runs a credit-risk assessment on structured financial features, reviews it and finalises it. A minimal assessment reference goes to Drunix.
5. An NBFC officer looks up the attestation from Drunix without seeing Bank A's internal records.
6. The NBFC requests two specific documents. The MSME approves a subset with an OTP. The NBFC views only those.
7. Access expires or is revoked and is then denied. All events appear in an audit trail.
8. A platform admin onboards institutions and monitors activity.

**Non-goals (v1):** LLM or AI inspection of customer documents; real integrations with NPCI rails, UPI, Aadhaar, CKYC, DigiLocker or SMS providers (all sit behind interfaces and are mocked); automated KYC or lending decisions; claims of regulatory compliance or production readiness; mobile apps; the payment leg (future extension).

## 3. Architecture

```
Browser (Next.js) ──► API (NestJS) ──► PostgreSQL (workflow, metadata, audit)
                        │   │   │
                        │   │   └──► StorageProvider ──► Nextcloud (WebDAV) | LocalFs (dev/test)
                        │   └──────► LedgerService ──► Drunix (Fabric Gateway) ──► Go chaincode
                        └──────────► Risk service (FastAPI, scikit-learn) — structured features only
```

**Invariants (MUST hold everywhere):**

- **I-1 Ledger-first.** Before releasing any document or session, the backend reads consent and attestation state from the ledger. If the ledger is unreachable, access is denied (fail closed).
- **I-2** PostgreSQL is a projection and workflow store. If it disagrees with the ledger on consent or attestation status, the ledger wins.
- **I-3** No document bytes, keys, OTPs, raw financial features or direct personal identifiers are ever written to the ledger.
- **I-4** The ML service never receives documents. It receives only validated structured features.
- **I-5** Access requires an authenticated officer of an ACTIVE institution. An OTP or a link alone is never sufficient.
- **I-6** Every material state change produces an audit record. Secrets, OTP values and keys are never logged.

**Design decisions:**

- **D-1** Storage sits behind a `StorageProvider` interface with a `NextcloudProvider` and a `LocalFsProvider` (dev and tests). A Nextcloud setup problem must never block progress.
- **D-2** Application-layer envelope encryption happens before any file reaches storage, so Nextcloud never sees plaintext.
- **D-3** The Drunix test network has three orgs: `PlatformOrg`, `BankAOrg`, `NbfcOrg`. One backend holds a wallet per org and submits each transaction as the acting org, so endorsement and caller checks are real. This is a prototype simplification. In production each institution would run its own gateway. State this honestly in the demo.
- **D-4** Business-side consent is submitted to the ledger by `PlatformOrg` on the business's behalf, after the backend has verified the business owner's OTP approval.
- **D-5** The on-chain business identifier is a random pseudonymous UUID (`businessRef`). GSTIN, PAN and names never go on-chain.
- **D-6** Document viewing is view-only by default (no download), with a watermark naming the institution, officer and time. Download is allowed only if the request asked for it and the business approved it.
- **D-7** Credit-risk output is decision support. The system never makes an automatic KYC or lending decision.
- **D-8** Institutions find a business through a short-lived **profile share code** that the business generates. There is no open search over businesses.

## 4. Technology stack and repository layout

| Layer | Choice |
| --- | --- |
| Web | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| API | Node.js, NestJS, TypeScript, Prisma |
| Database | PostgreSQL |
| Documents | Nextcloud (WebDAV) behind `StorageProvider`; LocalFs adapter for dev and tests |
| Ledger | NPCI Drunix; chaincode in Go; Fabric Gateway client for Node, version validated against Drunix in Stage 1 |
| ML | Python, pandas, scikit-learn (XGBoost only if evaluation justifies it), FastAPI, SHAP if the model supports it |
| Auth | Server-side sessions, RBAC, OTP |
| Tests | Jest and supertest, Go test, pytest, Playwright smoke tests, k6, custom Drunix benchmark |
| Dev | Docker Compose, Git, GitHub Actions (lint and test) |

```
trustledger/
  AGENTS.md
  docs/            SPEC.md  decisions.md  drunix-notes.md  model-card.md  api.md
  infra/           docker-compose.yml  nextcloud/  scripts/  drunix/ (cloned by the human)
  chaincode/trustledger/   Go chaincode and tests
  apps/api/        NestJS backend
  apps/web/        Next.js frontend (three dashboards)
  services/risk/   FastAPI credit-risk service, training code, model card
  tests/           e2e/  k6/  bench/
  reports/         metrics.md  security-tests.md
```

## 5. Domain model (PostgreSQL)

| Entity | Key fields and notes |
| --- | --- |
| Institution | id, name, type (BANK, NBFC, PLATFORM), mspId, status (ACTIVE, SUSPENDED), settings |
| User | id, role, institutionId or businessId, email, phone, passwordHash (argon2id), status |
| Business | id, `businessRef` (UUID, the on-chain id), legalName, identifiers (encrypted at rest), contact, ownerUserId |
| Document | id, `docRef` (UUID), businessId, docType, status, storageKey (opaque), wrappedDek, iv, authTag, salt (encrypted), contentHash, mime, sizeBytes, version, deletedAt |
| ProfileShareCode | id, businessId, codeHash, expiresAt, usedAt |
| AccessRequest | id, businessId, institutionId, requestedByUserId, scopeType (PROFILE, DOCUMENTS, FEATURES), requested docTypes or ids, purposeCode, requestedDurationMinutes, allowDownload, status (PENDING, APPROVED, PARTIALLY\_APPROVED, REJECTED, EXPIRED, CANCELLED) |
| ConsentGrant | projection of the on-chain consent: id (= consentId), requestId, scopeType, docRefs, expiresAt, status (ACTIVE, REVOKED, EXPIRED), ledgerTxId |
| AccessSession | id, consentId, officerUserId, institutionId, status (PENDING\_OTP, ACTIVE, EXPIRED, REVOKED, CLOSED), activatedAt, expiresAt, clientFingerprintHash |
| OtpChallenge | id, purpose (CUSTOMER\_APPROVAL, SESSION\_ACTIVATION), subjectUserId, boundEntityId, codeHash, attempts, expiresAt, consumedAt |
| Attestation | projection: id (= attId), businessId, institutionId, type, status, validUntil, ledgerTxId |
| FinancialProfile | id, businessId, periodStart, periodEnd, features (JSON), source (BUSINESS, OFFICER), consentId |
| RiskAssessment | id, businessId, institutionId, officerUserId, modelVersion, probability, band, topFactors, inputsHash, status (DRAFT, FINALISED), reviewNote, reportHash, ledgerTxId |
| AuditEvent | id, actor, institutionId, businessId, action, entityType, entityId, metadata (no secrets), at, ledgerTxId |
| LedgerTx | id, chaincodeFunction, txId, status, latencyMs (feeds the metrics) |

## 6. Drunix ledger design

The chaincode is written in Go and stores only minimal records as JSON under composite keys. Every record is append-only in effect: statuses move forward, and history is kept.

**On-chain records**

| Record | Fields |
| --- | --- |
| Institution | instId, mspId, type, status |
| Business | businessRef, createdAt |
| Document | docRef, businessRef, docType, contentHash, version, registeredAt |
| Attestation | attId, businessRef, issuerInstId, type, status (VALID, SUSPENDED, REVOKED, EXPIRED), docHashSnapshot\[\], issuedAt, validUntil |
| Consent | consentId, businessRef, institutionId, scopeType, docRefs\[\], purposeCode, expiresAt, status, approvalEvidenceHash |
| AccessEvent | eventId, consentId, institutionId, docRef, action (SESSION\_OPENED, DOCUMENT\_VIEWED, DOCUMENT\_DOWNLOADED, ACCESS\_DENIED, SESSION\_CLOSED), at |
| AssessmentRef | assessmentId, businessRef, institutionId, modelVersion, riskBand, reportHash, at |

**Chaincode functions**

| Function | Caller | Purpose |
| --- | --- | --- |
| `RegisterInstitution`, `SetInstitutionStatus` | PlatformOrg | Onboard, suspend or reactivate an institution |
| `RegisterBusiness(businessRef)` | PlatformOrg | Create the pseudonymous business record |
| `RegisterDocument(docRef, businessRef, docType, contentHash)` | PlatformOrg | Record a document fingerprint |
| `CreateConsent(...)`, `RevokeConsent(consentId)` | PlatformOrg | Record or withdraw the business's approval |
| `IssueAttestation(...)` | Active institution | Issuer is derived from the caller's MSP, never from an argument |
| `UpdateAttestationStatus(attId, status, reasonCode)` | Issuing institution | Suspend or revoke its own attestation only |
| `GetAttestations(businessRef, consentId)` | Active institution | Requires an ACTIVE PROFILE consent for that institution |
| `CheckAccess(consentId, institutionId, scopeType, docRef)` | Any | Returns allowed or denied with a reason code |
| `RecordAccessEvent(...)` | PlatformOrg | Append an access event |
| `RecordAssessment(...)` | Active institution | Store the minimal assessment reference |
| `GetHistory(key)` | Auditor roles | Return the history of a record |

**Rules**

- The caller's institution is derived from the client identity (MSP ID). Suspended institutions are rejected on every write.
- Time always comes from the transaction timestamp. Client-supplied clocks are ignored.
- A consent's expiry MUST be in the future and no more than 30 days ahead. Expired or revoked consent never allows access.
- `contentHash = SHA-256(plaintext ‖ salt)` in hex, with a random per-document salt that stays off-chain.
- `approvalEvidenceHash = SHA-256(otpChallengeId ‖ approvedAt ‖ approverUserId ‖ requestId)`. The OTP value is never included.
- **Endorsement:** institution-issued writes need endorsement from PlatformOrg and the acting org. Platform writes need PlatformOrg. The exact policy syntax is confirmed on Drunix in Stage 1.
- Chaincode unit tests use a mock stub and MUST cover negative cases: wrong caller, suspended institution, expired consent, duplicate ID, status moving backwards.

## 7. Document storage and encryption

- Upload flow: the backend receives the file, validates type and size, computes the salted hash, generates a random 256-bit data key, encrypts with AES-256-GCM, then stores only the ciphertext through `StorageProvider` under an opaque UUID key.
- The data key is wrapped by a master key behind a `KeyProvider` interface. Development reads the master key from an environment variable. Production would use a KMS or HSM. The prototype MUST say that its key handling stands in for a real HSM.
- The wrapped key, IV, auth tag and encrypted salt are stored in PostgreSQL, never beside the ciphertext.
- Release flow: check ledger access (I-1), fetch ciphertext, decrypt in memory, recompute the hash and compare it with the ledger value, then stream to the viewer with `Cache-Control: no-store`. A mismatch denies access and raises an audit alert.
- Deletion is crypto-shredding: delete the ciphertext and the wrapped key. The salted ledger hash then reveals nothing.
- Expiring or revoking access blocks future access through the platform. It cannot recall a copy that an institution has already downloaded, and the UI MUST say so.

## 8. Authentication, OTP and sessions

### 8.1 Accounts and passwords

- Passwords are hashed with argon2id. The minimum length is 12 characters. Passwords are never logged or returned.
- Business owners self-register. Institution users are created by their Institution Admin, who sets a one-time temporary password that is shown once. The user MUST change it at first login.
- Identity proofing of the business is out of scope. Registration only creates an account. The KYC performed by an institution is what the platform records as verification.
- After 5 consecutive failed logins the account locks for 15 minutes. Login errors are generic and never reveal whether the email exists. Every failure and lockout is audited.

### 8.2 Login sessions

- Sessions are server-side. The browser holds only an opaque session id in a cookie (`HttpOnly`, `SameSite=Lax`, `Secure` outside local development, `__Host-` prefix where possible).
- Every state-changing request MUST carry a CSRF token. The token is bound to the session and sent in a header.
- Idle timeout is 30 minutes and absolute lifetime is 8 hours. The session id is rotated at login and on any change of password or role. Logout revokes the session server-side.
- On every request the backend re-checks that the user is active and that the institution is ACTIVE (I-5). Suspending an institution invalidates its users' sessions and its AccessSessions immediately.

### 8.3 One-time passwords

- An OTP is 6 digits from a CSPRNG. Only `HMAC-SHA256(pepper, challengeId ‖ code)` is stored, in `codeHash`. The pepper comes from the environment.
- An OTP lives for 5 minutes, allows 5 attempts, and is single-use (`consumedAt`). It is bound to its purpose, its subject user and its `boundEntityId`. An OTP issued for one entity can never confirm another.
- Issuing a new challenge for the same purpose and bound entity invalidates the earlier one. Resends are limited to one per 30 seconds and three per 10 minutes.
- Comparison is constant-time. The OTP value is never logged, never returned by an API, and never stored in audit metadata (I-6).
- Delivery goes through an `OtpDeliveryProvider` interface. v1 ships a `DevOutboxProvider` that writes the message to a `DevOutbox` table, readable at `/dev/outbox` only when `DEV_OUTBOX=1` and `NODE_ENV` is not `production`. Real SMS or email providers are a non-goal. Automated tests read OTPs through a test helper on the same outbox.

| Purpose | Subject | Bound entity |
| --- | --- | --- |
| `CUSTOMER_APPROVAL` | Business owner | `requestId`, or `shareCodeId` for a profile share code |
| `SESSION_ACTIVATION` | Institution officer | `accessSessionId` |

### 8.4 Restricted access sessions

An `AccessSession` is the only way an institution officer can see a customer document.

- It can be created only if all of these hold: the officer has the `KYC_OFFICER` role, the officer's institution is ACTIVE, the consent belongs to that institution, and the ledger `CheckAccess` allows the consent now.
- It starts as `PENDING_OTP`. Activation needs the officer's OTP within 5 minutes. On success it becomes `ACTIVE` and a `SESSION_OPENED` access event is recorded.
- `expiresAt = min(consent.expiresAt, activatedAt + session duration)`. The default duration is 30 minutes and the maximum is 120. Extending access means a new session with a new OTP.
- Each officer may hold one ACTIVE session per consent.
- `clientFingerprintHash = SHA-256(serverSessionId ‖ userAgent)`. The session is usable only from the login session and browser that activated it. A forwarded URL, a different user, or a different browser is denied and audited.
- Sessions become `EXPIRED` by time, `REVOKED` by consent revocation or institution suspension, and `CLOSED` when the officer ends them. A background sweeper updates statuses, but access decisions MUST NOT depend on the sweeper. Expiry and revocation are re-evaluated on every request.

### 8.5 Defaults and limits

All values are configurable through environment variables. The defaults below apply.

| Setting | Default | Maximum |
| --- | --- | --- |
| OTP lifetime, attempts | 5 min, 5 | fixed |
| Login idle timeout, absolute lifetime | 30 min, 8 h | fixed |
| Profile share code lifetime | 60 min | 24 h |
| Profile consent duration | 7 days | 30 days (ledger rule) |
| Document consent duration | requested by the institution, shortenable by the business | 30 days (ledger rule) |
| Access request lifetime if unanswered | 7 days | 7 days |
| Access session duration | 30 min | 120 min |
| Attestation validity | 12 months | 24 months |
| Upload size and types | 10 MB; PDF, PNG, JPEG | fixed |
| Share-code redemption attempts | 5 per minute per user, 20 per hour per institution | fixed |

### 8.6 Schema additions required by sections 8 to 14

These extend the domain model in section 5. Prisma migrations MUST include them.

- **User**: `mustChangePassword`, `failedLoginCount`, `lockedUntil`, `lastLoginAt`.
- **ServerSession**: id, userId, createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt, ipHash, userAgentHash, csrfTokenHash, revokedAt.
- **KycReview**: id, businessId, institutionId, officerUserId, consentId, accessSessionId, outcome (`VERIFIED`, `NOT_VERIFIED`, `NEEDS_MORE_INFO`), checklist (JSON), notes, docRefsReviewed, attestationId (nullable), createdAt. Institution-private. Never exposed to other institutions or on-chain.
- **Notification**: id, userId, type, entityType, entityId, createdAt, readAt.
- **DevOutbox**: id, channel, recipient, body, createdAt. Development and test only.
- **AccessRequest**: add `message` (max 280 chars), `decidedByUserId`, `decidedAt`, `approvalOtpChallengeId`.
- **ProfileShareCode**: add `consentDurationMinutes`, `otpChallengeId`, `redeemedByUserId`, `redeemedByInstitutionId`.
- **RiskAssessment**: add `financialProfileId`, `featureSchemaVersion`.
- **Document.status** values: `PENDING_REGISTRATION`, `REGISTERED`, `REPLACED`, `DELETED`.

## 9. Roles and access control

### 9.1 Roles

`PLATFORM_SUPER_ADMIN`, `INSTITUTION_ADMIN`, `KYC_OFFICER`, `COMPLIANCE_OFFICER`, `LOAN_OFFICER`, `BUSINESS_OWNER`, `BUSINESS_EMPLOYEE`. A user has exactly one role. The seed data gives Bank A and the NBFC separate users for the KYC and loan roles.

### 9.2 Permission matrix

SA = Platform Super Admin, IA = Institution Admin, KYC = KYC Officer, CMP = Compliance Officer, LN = Loan Officer, BO = Business Owner, BE = Business Employee.

| Permission | SA | IA | KYC | CMP | LN | BO | BE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Onboard, suspend, reactivate institutions | ✔ | — | — | — | — | — | — |
| Create institution admins | ✔ | — | — | — | — | — | — |
| Create and disable users of own institution | — | ✔ | — | — | — | — | — |
| View platform health, failed logins, platform audit (metadata only) | ✔ | — | — | — | — | — | — |
| View own institution's audit trail | — | user-management events only | — | ✔ | — | — | — |
| Redeem a profile share code | — | — | ✔ | — | ✔ | — | — |
| Create a documents request | — | — | ✔ | — | — | — | — |
| Create a features request | — | — | — | — | ✔ | — | — |
| Activate a session and view approved documents | — | — | ✔ | — | — | — | — |
| Record a KYC review and issue or change own attestations | — | — | ✔ | — | — | — | — |
| View attestations through an active PROFILE consent | — | — | ✔ | ✔ | ✔ | — | — |
| Enter features, run and finalise a risk assessment | — | — | — | — | ✔ | — | — |
| View own institution's risk assessments | — | — | — | ✔ | ✔ | — | — |
| Manage business profile; generate share codes; approve, reject, revoke | — | — | — | — | — | ✔ | — |
| Upload documents | — | — | — | — | — | ✔ | ✔ |
| Replace or delete documents; view own documents | — | — | — | — | — | ✔ | metadata only |
| View own business's access history | — | — | — | — | — | ✔ | — |

Document content is never available to `PLATFORM_SUPER_ADMIN` or `INSTITUTION_ADMIN`. Administration and document access are separate permissions.

v1 simplification: `BUSINESS_EMPLOYEE` is not a per-document delegation model. Fine-grained delegation is a future extension and the UI MUST NOT imply otherwise.

### 9.3 Enforcement layers

Every protected route passes three checks, and default is deny.

1. **Role guard.** A NestJS guard and decorator check the role against the matrix.
2. **Tenant scope.** A `PolicyService` ensures the user acts only within their own institution or business.
3. **Resource check.** Request status, consent, session, ledger `CheckAccess` and validity period are verified (I-1).

The matrix lives in one policy module. A table-driven test enumerates every route against every role and fails if any route is unclassified.

## 10. Core workflows

State machines are authoritative. A transition not listed is rejected.

- **AccessRequest:** `PENDING` → `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`.
- **ConsentGrant:** `ACTIVE` → `REVOKED`, `EXPIRED`.
- **AccessSession:** `PENDING_OTP` → `ACTIVE` → `EXPIRED`, `REVOKED`, `CLOSED`. `PENDING_OTP` may also become `EXPIRED`.
- **Attestation (D-9):** `VALID` → `SUSPENDED` or `REVOKED`; `SUSPENDED` → `REVOKED`. There is no reinstatement; an institution issues a new attestation instead. `EXPIRED` is computed from `validUntil` against the transaction time and is never written.
- **RiskAssessment:** `DRAFT` → `FINALISED`. Only `FINALISED` assessments reach the ledger.

**Other design decisions**

- **D-9** is described above.
- **D-10** An institution requests documents by `docType`. The business chooses which concrete documents to share.
- **D-11** The profile share code (D-8) doubles as the business's PROFILE consent. Generating it requires the owner's OTP. Redeeming it creates a PROFILE consent for the redeeming institution only.
- **D-12** Replacing or deleting a document is blocked (HTTP 409) while any ACTIVE consent references it. The owner must revoke first.

### W1. Registration and upload (scope item 1)

1. The owner registers. The backend creates the User and Business with a new `businessRef` and calls `RegisterBusiness` as PlatformOrg.
2. On upload the backend validates the magic number, type and size, then runs the section 7 pipeline: salted hash, AES-256-GCM, `StorageProvider`.
3. The Document starts as `PENDING_REGISTRATION`. The backend calls `RegisterDocument` and moves the document to `REGISTERED` on success. A document is not shareable until `REGISTERED`. If the ledger call fails, the document stays pending and a retry is offered. Nothing is silently dropped.
4. Replacing a document creates version n+1 with a new hash, registered on-chain. Earlier attestations then no longer match the current document, and the UI MUST show "changed since verified".

### W2. Share code, request and approval (scope items 2 and 6)

1. **Share code.** The owner picks a consent duration and asks for a code. The backend issues a `CUSTOMER_APPROVAL` OTP bound to the new `shareCodeId`. After the owner confirms it, an 8-character code from an unambiguous 32-symbol alphabet is shown once. Only `codeHash` is stored. It expires in 60 minutes by default.
2. **Redeem.** An officer enters the code. Redemption is rate-limited (section 8.5). On success the backend sets `usedAt`, creates an AccessRequest (`PROFILE`, status `APPROVED`, `approvalOtpChallengeId` from the code's OTP), and has PlatformOrg call `CreateConsent` for the redeeming institution. `approvalEvidenceHash` is computed with the code's challenge id, the approval time, the owner's user id and the new request id. The officer sees only the legal name of the business. If the code is forwarded to the wrong institution, that institution gets the PROFILE consent; the short lifetime, single use and visible redemption event in the business's dashboard are the mitigations. Binding a code to a named institution is a MAY hardening.
3. **Document request.** With an ACTIVE PROFILE consent, a `KYC_OFFICER` creates a DOCUMENTS request: docTypes, `purposeCode`, requested duration, `allowDownload` and an optional message.
4. **Approval.** The owner sees the request, ticks individual documents, may shorten the duration and may refuse download, then confirms with an OTP bound to the `requestId`.
5. **Ledger-first.** After OTP verification, PlatformOrg calls `CreateConsent` with the approved `docRefs`. Only after the ledger commits does the backend write the ConsentGrant and set the request to `APPROVED` or `PARTIALLY_APPROVED`. If the owner approves nothing, the request becomes `REJECTED`. If the ledger call fails, the request stays `PENDING` and the owner sees a retry message. A reconciler job SHOULD rebuild missing projections from the ledger (I-2).
6. **Revoke.** The owner revokes. PlatformOrg calls `RevokeConsent`, the ConsentGrant becomes `REVOKED`, its sessions become `REVOKED`, and the institution is notified.
7. Unanswered requests expire after 7 days. The requester can cancel a `PENDING` request.

### W3. Bank A KYC and attestation (scope items 2 and 3)

1. **Open a session.** The officer creates an AccessSession for the consent and activates it with an OTP (section 8.4).
2. **View documents.** Each view runs the section 7 release flow. The viewer shows server-rendered, watermarked pages (D-6). The watermark is burned into the rendered page images (PDF to PNG, PNG and JPEG re-encoded). A CSS overlay alone does not satisfy D-6.
3. **Ledger access events.** To keep the ledger lean, the backend records on-chain: `SESSION_OPENED`, `SESSION_CLOSED`, the first `DOCUMENT_VIEWED` per document per session, every `DOCUMENT_DOWNLOADED`, and `ACCESS_DENIED` (up to 20 per session). Every view and denial is also written to the PostgreSQL audit trail.
4. **Record the review.** The officer saves a KycReview with a checklist, notes and an outcome.
5. **Issue the attestation.** If the outcome is `VERIFIED`, the officer issues a `KYC_BASIC` attestation. The backend builds `docHashSnapshot[]` from ledger hashes of the documents the officer actually viewed in this session. Only viewed documents can be included. It calls `IssueAttestation` as BankAOrg, with endorsement from PlatformOrg and BankAOrg. `validUntil` defaults to 12 months.
6. The officer may later suspend or revoke their own attestation with a reason code.

### W4. Credit-risk assessment (scope item 4)

1. A `LOAN_OFFICER` creates a FinancialProfile. If the data comes from the business (`source = BUSINESS`), a FEATURES consent is required. If the institution enters its own data (`source = OFFICER`), no business consent is needed and the action is audited.
2. The backend validates the features against the schema in section 12, calls the risk service and stores a `DRAFT` assessment with `inputsHash`.
3. The officer reviews the probability, the band and the top factors, then writes a review note (minimum 20 characters) and finalises. The backend computes `reportHash` and calls `RecordAssessment` as the officer's org. The status becomes `FINALISED`.
4. The assessment is decision support (D-7). The UI MUST NOT show an approve or reject action driven by the score.
5. In v1 no read function exposes an AssessmentRef to other institutions. Auditors can see it through `GetHistory`.

### W5. NBFC attestation lookup (scope item 5)

1. The owner generates a new share code (W2) and gives it to the NBFC officer.
2. After redemption, the backend calls `GetAttestations(businessRef, consentId)` as NbfcOrg.
3. The response contains issuer institution name, type, status (with `EXPIRED` computed), `issuedAt`, `validUntil`, and `documentsUnchangedSinceAttestation`. The last field is computed by comparing the snapshot with current on-chain document hashes.
4. KycReview notes, assessments and Bank A's internal records are never part of the response.
5. Accepting the attestation is the NBFC's own decision. The UI says so.

### W6. NBFC document access (scope items 6 and 7)

The NBFC officer requests two specific document types (for example a GST certificate and a bank statement). The owner approves a subset and confirms with an OTP. The officer opens a session with an OTP and views only the approved documents. Expiry, revocation and denial behave as in 8.4.

### W7. Expiry, revocation and denial (scope item 7)

- After expiry or revocation, any document request returns HTTP 403 with a reason code, and an `ACCESS_DENIED` event is recorded.
- A suspended institution is denied everywhere immediately.
- The UI MUST state that expiry and revocation stop future access through the platform and cannot recall a copy already downloaded.

### W8. Platform administration (scope item 8)

1. The Super Admin creates an Institution with a type and an `mspId` from the configured test-network orgs. The backend calls `RegisterInstitution`, then creates the Institution Admin.
2. Suspension calls `SetInstitutionStatus`. Its effect is immediate (8.2).
3. The admin dashboard shows institutions, failed logins, lockouts, ledger status, ledger transaction counts and latencies, risk-service health and Nextcloud health. It shows metadata only, never document content.

## 11. API surface

Base path `/api/v1`. JSON only. Authentication is the session cookie from section 8.2. The agent MUST publish the full contract as OpenAPI (NestJS Swagger) and summarise it in `docs/api.md`.

### 11.1 Conventions

- **Errors:** `{ "code": "STRING_CODE", "message": "...", "requestId": "..." }` with the correct HTTP status. Messages never leak whether a resource exists in another tenant. Cross-tenant access returns 404.
- **Access denials** carry a reason code such as `CONSENT_NOT_FOUND`, `CONSENT_EXPIRED`, `CONSENT_REVOKED`, `INSTITUTION_MISMATCH`, `INSTITUTION_SUSPENDED`, `SCOPE_MISMATCH`, `DOC_NOT_IN_SCOPE`, `SESSION_EXPIRED`, `SESSION_NOT_ACTIVE`, `FINGERPRINT_MISMATCH`, `INTEGRITY_MISMATCH`, `LEDGER_UNAVAILABLE`.
- **Idempotency:** every POST that triggers a ledger transaction accepts an `Idempotency-Key` header. A repeated key returns the first result and never submits a second transaction.
- **Rate limits** apply to login, OTP issue and verify, share-code redemption and document views.
- **Pagination:** `limit` and `cursor` on every list endpoint.
- **Validation:** DTOs are validated with an allow-list. Unknown fields are rejected (no mass assignment).

### 11.2 Endpoints

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | all | Session management |
| `POST /business/register` | public | Create the owner and business |
| `POST /admin/institutions`, `GET /admin/institutions`, `PATCH /admin/institutions/:id/status` | SA | Onboard, list, suspend or reactivate |
| `POST /admin/institutions/:id/admins` | SA | Create an institution admin |
| `GET /admin/overview`, `GET /admin/audit` | SA | Health, failed logins, ledger metrics, metadata-only audit |
| `GET /institution/users`, `POST /institution/users`, `PATCH /institution/users/:id` | IA | Manage employees |
| `GET /business/me`, `PATCH /business/me` | BO | Business profile |
| `GET /business/documents`, `POST /business/documents` | BO, BE | List and upload |
| `PUT /business/documents/:id`, `DELETE /business/documents/:id` | BO | Replace (new version) or delete (crypto-shred), subject to D-12 |
| `GET /business/documents/:id/view` | BO | Owner views own document |
| `POST /business/share-codes`, `POST /business/share-codes/:id/confirm` | BO | Start with OTP, then confirm to receive the code |
| `GET /business/requests`, `GET /business/requests/:id` | BO | Incoming requests |
| `POST /business/requests/:id/otp`, `POST /business/requests/:id/decision` | BO | Issue the approval OTP; approve (with OTP) or reject |
| `GET /business/consents`, `POST /business/consents/:id/revoke` | BO | Active grants and revocation |
| `GET /business/access-history`, `GET /business/attestations` | BO | Who accessed what, and verification history |
| `GET /notifications`, `POST /notifications/:id/read` | BO, institution roles | In-app notifications |
| `POST /institution/profile-lookup` | KYC, LN | Redeem a share code |
| `GET /institution/consents` | KYC, CMP, LN | Consents held by the institution |
| `POST /institution/requests`, `GET /institution/requests`, `POST /institution/requests/:id/cancel` | KYC (documents), LN (features) | Request management |
| `POST /institution/sessions`, `POST /institution/sessions/:id/activate`, `POST /institution/sessions/:id/close` | KYC | Restricted session lifecycle |
| `GET /institution/sessions/:id/documents`, `GET /institution/sessions/:id/documents/:docRef/pages/:n`, `GET /institution/sessions/:id/documents/:docRef/download` | KYC | Approved documents, watermarked pages, download only if approved |
| `POST /institution/kyc-reviews` | KYC | Record findings |
| `POST /institution/attestations`, `PATCH /institution/attestations/:id/status` | KYC | Issue; suspend or revoke own |
| `GET /institution/consents/:consentId/attestations` | KYC, CMP, LN | Attestations via a PROFILE consent |
| `POST /institution/financial-profiles` | LN | Enter or import structured features |
| `POST /institution/risk-assessments`, `POST /institution/risk-assessments/:id/finalise`, `GET /institution/risk-assessments` | LN (CMP read) | Draft, finalise, list |
| `GET /institution/audit` | CMP, IA (scoped) | Institution audit trail |
| `GET /health` | internal | Liveness and dependency status |
| `GET /dev/outbox` | dev only | OTP outbox, disabled in production |

## 12. Credit-risk service

### 12.1 Contract

- `POST /v1/assess` takes `{ featureSchemaVersion, features }` and returns:
  `{ probability, band, topFactors[], modelVersion, featureSchemaVersion, scoredAt, warnings[] }`.
- `GET /v1/model-info` returns the model version, feature schema and training-data label (for example `synthetic`).
- `GET /health` returns liveness.
- The service is reachable only on the internal Docker network and requires a shared secret in `X-Internal-Token`. It never receives documents, names, GSTIN or PAN (I-4).
- It stores nothing and logs no feature values. Requests are size-limited. Pydantic models use `extra = forbid`. Out-of-range values return 422. Values outside the training range add a warning in `warnings`.

### 12.2 Feature schema v1

The set below is the starting schema. The dataset decides the final set. Any change bumps `featureSchemaVersion`.

| Feature | Meaning |
| --- | --- |
| `avg_monthly_revenue` | Mean monthly revenue over 12 months, INR |
| `revenue_growth_6m` | Change in mean revenue, last 6 months versus the previous 6 |
| `revenue_cv_12m` | Coefficient of variation of monthly revenue |
| `avg_monthly_net_cash_flow` | Mean monthly net cash flow, INR (may be negative) |
| `negative_cashflow_months_12m` | Months with negative net cash flow, 0 to 12 |
| `monthly_debt_obligation` | Existing monthly debt service, INR |
| `debt_service_coverage_ratio` | Operating cash flow divided by debt service |
| `debt_to_annual_revenue` | Total debt divided by annual revenue |
| `late_payments_24m` | Count of late payments in 24 months |
| `max_days_past_due_24m` | Worst delinquency in 24 months, days |
| `credit_utilisation` | Used credit divided by limit |
| `business_age_months` | Age of the business, months |
| `requested_loan_to_annual_revenue` | Requested amount divided by annual revenue |

### 12.3 Target, data and splits

- **Target:** serious delinquency (90 or more days past due) within 12 months after the observation date. Historical approval or rejection decisions are never used as the label.
- **D-13 Data:** the default is a synthetic generator (`services/risk/data/generate.py`) with a documented data-generating process, fixed random seed and configurable class imbalance. A public labelled dataset MAY replace it. In that case the column mapping is documented in the model card.
- Anything produced from synthetic data is labelled `synthetic` in the model card, `GET /v1/model-info`, the dashboard and every report. It is never presented as evidence of real-world lending accuracy.
- Stratified 60/20/20 train, validation and test split with a fixed seed. The test set is used once, at the end. Leakage checks are part of the pipeline.

### 12.4 Models and selection

- A standardised logistic regression is the baseline. A histogram gradient-boosting classifier is the main candidate. XGBoost is added only if it beats both on validation by a margin recorded in the model card.
- Monotonic constraints are SHOULD for features with a clear direction, such as debt service coverage ratio.
- Probabilities are calibrated on validation data (isotonic or Platt, whichever evaluates better).
- Explanations: SHAP for tree models, standardised coefficient contributions for logistic regression. Each of the top 5 factors returns the feature, its value, a signed contribution and a direction.
- Higher probability always means higher repayment risk. Bands are `LOW`, `MEDIUM` and `HIGH`. Thresholds live in `bands.json` and the model card explains how they were chosen. Initial values are placeholders until evaluation sets them.

### 12.5 Governance and tests

- `make train` reproduces the artifacts from the seed. `model_version = featureSchemaVersion + "-" + first 8 hex of the artifact SHA-256`. The service refuses to start if the artifact hash does not match the manifest.
- The model card (`docs/model-card.md`) covers intended use, non-use (not identity verification, not an automatic decision, not evidence of fraud), data, target, split, metrics, calibration, limitations and fairness caveats.
- pytest covers schema validation, determinism, contract shape, monotonic sanity (raising `debt_service_coverage_ratio` with all else fixed must not raise risk), and out-of-range handling.
- The evaluation script writes `reports/model-metrics.json` with ROC-AUC, PR-AUC, precision, recall and F1 at the documented threshold, Brier score and a reliability table, all computed on the held-out test set.

## 13. Web application

One Next.js app with three route groups and a shared login page: `(admin)`, `(institution)` and `(business)`. The UI never talks to the ledger, Nextcloud or the risk service directly.

### 13.1 Screens

- **Admin:** institutions list and onboarding, suspend and reactivate, institution admin creation, platform overview (failed logins, lockouts, ledger transaction counts and latency, dependency health), metadata-only audit.
- **Institution:** employees (IA); profile-code entry; request composer and request list; consents; session activation with OTP; document viewer with watermark and countdown to expiry; KYC review form; attestation issue and manage; attestation lookup; financial profile form; risk assessment draft, review and finalise; institution audit trail; notifications.
- **Business:** registration and profile; document vault with upload, replace, delete and version badges; "changed since verified" indicators; share-code generator with OTP; incoming requests with per-document selection, duration and download controls; active consents with revoke; access history; verification history showing issuer and date; notifications.

### 13.2 Required notices

The UI MUST show each of these where it applies.

- **N-1** Expiry and revocation stop future access through the platform. They cannot recall a copy that has already been downloaded.
- **N-2** The risk score is decision support. It is not identity verification and not a lending decision.
- **N-3** Risk results derived from synthetic data are labelled as synthetic.
- **N-4** An earlier attestation is evidence that an institution performed a check. Another institution decides whether to accept it.
- **N-5** The prototype's key handling and single-backend multi-org ledger setup stand in for production designs (section 16).
- A persistent banner reads "Prototype. Synthetic data only."

### 13.3 UX and security requirements

- Loading, empty, error and "ledger unavailable" states exist on every screen that depends on the backend.
- The OTP input shows remaining attempts and time. Resend respects the limits in 8.3.
- The viewer disables the browser context menu and text selection on rendered pages as a deterrent only. The notices acknowledge that screenshots cannot be prevented.
- No tokens, OTPs or document data go into `localStorage`. The CSP is strict and cookies follow 8.2.
- Basic accessibility: keyboard navigation, labelled form fields and sufficient contrast.

## 14. Audit and notifications

### 14.1 Audit

- Every material state change writes an `AuditEvent` in the same database transaction as the change (I-6). Metadata never contains secrets, OTP values, keys or document content.
- The application database role has INSERT and SELECT only on `audit_events`. UPDATE and DELETE are revoked.
- Events tied to a ledger transaction store its `ledgerTxId`.
- Action codes: `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOCKOUT`, `AUTH_LOGOUT`, `USER_CREATED`, `USER_DISABLED`, `INSTITUTION_REGISTERED`, `INSTITUTION_STATUS_CHANGED`, `BUSINESS_REGISTERED`, `DOCUMENT_UPLOADED`, `DOCUMENT_REPLACED`, `DOCUMENT_DELETED`, `SHARE_CODE_CREATED`, `SHARE_CODE_REDEEMED`, `SHARE_CODE_FAILED`, `REQUEST_CREATED`, `REQUEST_APPROVED`, `REQUEST_PARTIALLY_APPROVED`, `REQUEST_REJECTED`, `REQUEST_CANCELLED`, `REQUEST_EXPIRED`, `CONSENT_REVOKED`, `OTP_ISSUED`, `OTP_VERIFIED`, `OTP_FAILED`, `SESSION_OPENED`, `SESSION_CLOSED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`, `ACCESS_DENIED`, `INTEGRITY_MISMATCH`, `KYC_REVIEW_RECORDED`, `ATTESTATION_ISSUED`, `ATTESTATION_STATUS_CHANGED`, `ATTESTATION_LOOKUP`, `FEATURES_SUBMITTED`, `RISK_ASSESSED_DRAFT`, `RISK_FINALISED`, `LEDGER_UNAVAILABLE`, `CONFIG_CHANGED`.
- **Visibility:** the business sees events about its own business. A Compliance Officer sees the institution's own events in full. An Institution Admin sees user-management events only. The Super Admin sees platform-level metadata. Nobody sees another institution's events.
- Two audit sources exist by design. PostgreSQL holds the full operational trail. The ledger holds the shared, minimal events from section 6, and `GetHistory` serves auditors.

### 14.2 Notifications

In-app notifications are written to the `Notification` table for these events: a new request (business); a request decided, a consent revoked or expiring, a session opened on the business's documents (institution and business as relevant); a document viewed or downloaded (business); an attestation changed (business). Notifications contain no document content or personal data beyond names already visible to the recipient. OTP delivery is separate and uses the provider in 8.3.

## 15. Testing and metrics

### 15.1 Test layers

| Layer | Tooling | What it must cover |
| --- | --- | --- |
| Chaincode | Go test with a mock stub | Every function, plus wrong caller, suspended institution, expired consent, duplicate ID, status moving backwards, consent over 30 days |
| Backend unit | Jest | Policy matrix, crypto round trip, tampered ciphertext, OTP rules, state machines |
| Backend integration | Jest and supertest on real PostgreSQL | Full workflows W1 to W8 against `LocalFsProvider` |
| Ledger contract | Same suite, two targets | `LedgerService` behaviour on an in-memory fake (used in CI) and on the real Drunix network (required before any metric is reported) |
| Risk service | pytest | Section 12.5 |
| End to end | Playwright | The demo journey in 17.2 |
| Load and benchmark | k6, custom Drunix script | Section 15.3 |

The in-memory ledger fake exists only so CI can run without a Drunix network. It MUST NOT be used to produce reported metrics.

### 15.2 Security tests

Each test is automated. Results go to `reports/security-tests.md` with pass and fail counts from actual runs.

| ID | Test | Expected |
| --- | --- | --- |
| S-1 | Institution B reads a document from Institution A's session or consent | 404 or 403, audited |
| S-2 | Document request after session expiry | 403 `SESSION_EXPIRED` |
| S-3 | Document request after consent revocation | 403 `CONSENT_REVOKED` |
| S-4 | Document request after institution suspension, mid-session | 403 `INSTITUTION_SUSPENDED` |
| S-5 | Session URL used from another login session or browser | 403 `FINGERPRINT_MISMATCH` |
| S-6 | OTP reuse, OTP for a different entity, expired OTP, 6th attempt | All rejected |
| S-7 | Super Admin or Institution Admin requests document content | 403 |
| S-8 | Ledger unreachable during a document request | 403 `LEDGER_UNAVAILABLE` (fail closed) |
| S-9 | Ciphertext modified in storage | Access denied, `INTEGRITY_MISMATCH` audited |
| S-10 | Share-code brute force | Locked out by rate limits |
| S-11 | CSRF without token; session fixation | Rejected |
| S-12 | Role escalation by editing request bodies (mass assignment) | Ignored or rejected |
| S-13 | Upload of wrong type, spoofed extension or oversize file | Rejected |
| S-14 | Replace or delete a document under an active consent | 409 (D-12) |
| S-15 | Download when not approved | 403 |
| S-16 | Logs and audit metadata scanned for OTPs, passwords, keys, tokens | None found |
| S-17 | Features sent to the risk service without the internal token | 401 |
| S-18 | Document in a session outside the approved `docRefs` | 403 `DOC_NOT_IN_SCOPE` |

### 15.3 Metrics protocol

All numbers MUST come from actual runs. A metric that was not measured is reported as "not measured". Tables are generated by script from raw files in `reports/raw/`, never typed by hand.

Every report records the environment: hardware, OS, Docker resources, component versions, Drunix network topology (orgs, peers, orderers) and run date.

| Metric | Definition |
| --- | --- |
| Drunix committed TPS | Successfully committed submit transactions divided by the length of the measurement window |
| Drunix latency | Submit to commit for writes, round trip for evaluate queries. Report p50, p95 and p99 |
| Upload and retrieval latency | Time to store (hash, encrypt, store, register) and to release a document, p50 and p95 |
| End-to-end authorization latency | From the owner's decision request to the institution's first successful page view, OTP read from the dev outbox |
| API error rate | Unexpected non-2xx responses divided by all requests, excluding intentional negative tests |
| Availability | Successful health checks divided by all checks during a stated period |
| Authorization success rate | Correct allow and deny outcomes divided by all authorization tests |
| Multi-institution flow time | Wall-clock time of the scripted W1 to W7 journey with automated OTP entry |
| Upload reduction | Scenario count: one business, three institutions, n documents. Baseline is 3 × n uploads when each institution collects separately. TrustLedger count is n. Reported as a property of this scenario only |
| Model metrics | Section 12.5, on the held-out test set, labelled synthetic where applicable |

**Drunix benchmark.** Run reads (`CheckAccess`) and writes (`CreateConsent`, `RecordAccessEvent`) separately and as a mix, at concurrency 1, 5, 10, 25 and 50, for 60 seconds each after a warm-up. Repeat each configuration at least 3 times. Report each run and the median. Record failed and timed-out transactions.

## 16. Security, privacy and honesty

### 16.1 Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Forwarded or stolen session link | I-5, 8.4 fingerprint binding, institution authentication, expiry |
| Admin reading customer documents | No permission path (9.2), tested in S-7 |
| Nextcloud compromised | Only AES-256-GCM ciphertext is stored there (D-2) |
| Database compromised | Data keys are wrapped by a master key held elsewhere; salts are encrypted; ledger hashes are salted |
| Ledger or database tampering | Ledger-first checks (I-1, I-2), hash comparison at release |
| OTP replay or guessing | Single use, entity binding, attempt limits, lockouts |
| Document swapped in storage | Hash mismatch denies access and raises an audit alert |
| Ledger outage | Fail closed |
| XSS and CSRF | Strict CSP, `HttpOnly` cookies, CSRF tokens |
| Malicious upload | Type, size and magic-number checks; viewer renders re-encoded pages |

### 16.2 Honesty statements

These MUST appear in the README and be said in the demo.

- **H-1** One backend holds a wallet for each org. In production each institution runs its own gateway (D-3).
- **H-2** PlatformOrg records consent on the business's behalf after the backend verifies the OTP (D-4). A production design would use approvals signed by the business.
- **H-3** The master key comes from an environment variable. It stands in for a KMS or HSM.
- **H-4** OTPs go to a development outbox. No real SMS or email provider is integrated.
- **H-5** The credit-risk model uses synthetic data unless a public dataset is documented. Its results do not show real-world accuracy.
- **H-6** The prototype makes no claim of regulatory compliance or production readiness.
- **H-7** A document that has been downloaded cannot be recalled.
- **H-8** The viewer's protections deter casual copying. They cannot prevent screenshots.

### 16.3 Privacy and hygiene

- All data in the repository and the demo is synthetic. No real personal data is used.
- `.env` is never committed. `.env.example` lists every variable with a placeholder.
- Log output is redacted for secrets (S-16).
- Dependency versions are pinned. `npm audit`, `pip-audit` and `govulncheck` results are recorded in `reports/security-tests.md`, including any unresolved findings.

## 17. Completion, demo and risks

### 17.1 Definition of done

- Every item in section 2 works end to end on the real Drunix network.
- The chaincode negative tests, the S-1 to S-18 security tests and the API integration tests pass.
- `reports/metrics.md` and `reports/security-tests.md` are generated from real runs. Anything unmeasured is marked "not measured".
- `docs/drunix-notes.md`, `docs/decisions.md`, `docs/model-card.md` and `docs/api.md` are current.
- The README states the honesty statements H-1 to H-8, contains a one-command local start and a seeded demo.
- A fresh clone starts with `docker compose up` plus the documented Drunix steps.

### 17.2 Demo script

1. Super Admin logs in and shows the two onboarded institutions and the platform overview.
2. The business registers and uploads a GST certificate, a bank statement and a registration certificate. Show the registered fingerprints.
3. The business generates a share code with an OTP. The Bank A officer redeems it and requests documents. The business approves two documents with an OTP.
4. The Bank A officer activates a session with an OTP, views the watermarked pages, records the review and issues the attestation. Show the Drunix transaction.
5. The loan officer enters features, runs the assessment, reviews the factors and finalises it. Show the synthetic-data label.
6. The business generates a second code. The NBFC officer redeems it and sees the Bank A attestation without any Bank A internal data.
7. The NBFC requests the GST certificate and bank statement. The business approves one with an OTP. The officer views it.
8. Show denial: wrong institution, a forwarded session URL, then revoke and expiry. Show the reason codes.
9. Show the audit trail on the business, institution and admin sides, then the ledger history.
10. Show the measured metrics and the honesty statements.

### 17.3 Pitch deck mapping

- **Slide 2, problem, solution, value:** repeated verification, customer-controlled sharing, the measured upload-reduction scenario.
- **Slide 3, integration and architecture:** section 3 diagram, the three dashboards, Nextcloud, risk service, Drunix flow.
- **Slide 4, innovation, scale, security, risk, impact:** measured TPS, latency, availability or error rate, S-1 to S-18 results, model metrics (labelled synthetic), mitigations from 16.1. Figures come only from `reports/`.
- **Slide 5, prototype, demo, roadmap:** the demo script, repository and demo links, section 17.5.

### 17.4 Risks and open items

| Risk or open item | Handling |
| --- | --- |
| Drunix commands, ports, Gateway client version and endorsement syntax unknown | Stage 1 discovery, recorded in `docs/drunix-notes.md` |
| Time source for read-only `CheckAccess` calls may come from the client's proposal | Stage 1 records Drunix behaviour. The backend ALSO compares `expiresAt` with its own clock, and both must allow |
| Nextcloud setup problems | `LocalFsProvider` keeps progress unblocked (D-1) |
| PDF rendering dependency in the API container | Use a pinned system tool (for example poppler) in the Docker image. Fall back to images only if blocked and record it in `docs/decisions.md` |
| Benchmark numbers differ from expectations | Report what was measured. Never adjust numbers |
| Synthetic data limits model credibility | Label everywhere (H-5, N-3) |
| Scope creep | Section 2 non-goals and 17.5 define the line |

### 17.5 Future extensions

Simulated payment adapter linked to verification and authorization conditions, dispute resolution, additional data-source integrations, maker-checker approval for attestations, per-document delegation for business employees, share codes bound to a named institution, signed business approvals, KMS or HSM key management, per-institution gateways, and evaluation with real partners and data.

---

# Part B — Working agreement for the coding agent

Copy everything in this part into `AGENTS.md` at Stage 0.

## B.1 Operating rules

1. `docs/SPEC.md` is the source of truth. Read the relevant sections before each stage. If the spec is ambiguous or contradicts itself, stop and ask. Do not guess.
2. Work on ONE stage at a time. When the stage's acceptance checks pass, write the report and STOP. Do not start the next stage.
3. Stay inside the stage's scope. Do not add features, services or dependencies that the spec does not call for. Record any needed deviation in `docs/decisions.md` with the reason and wait for approval if it changes an invariant (I-n), a design decision (D-n), or a non-goal.
4. Never guess or invent Drunix commands, ports, APIs or client versions. Read the Drunix repository and documentation. Record what you found, with file paths, in `docs/drunix-notes.md`.
5. Never fabricate results. Metrics, test counts and model scores must come from commands you ran. If something was not run, say "not run".
6. Never claim a feature works unless you ran a test or command that shows it. Include the command and its relevant output in the report.

## B.2 Invariants you must not break

- I-1 to I-6 from section 3 of the spec. Access fails closed.
- No document bytes, keys, OTPs, raw features or direct personal identifiers on the ledger.
- No secrets in the repository, logs, audit metadata, error messages or client code.
- Admin permissions never include document content access.
- The risk service never receives documents or identifiers.

## B.3 Engineering standards

- TypeScript strict mode. ESLint and Prettier are mandatory. Go code passes `gofmt` and `go vet`. Python code passes `ruff` and `black`.
- Validate all external input with an allow-list. Reject unknown fields.
- Use parameterised queries through Prisma. No string-built SQL.
- Pin dependency versions. Add a dependency only when needed and note why in `docs/decisions.md`.
- Every security-relevant behaviour gets an automated test, including the negative case.
- Use UTC and the ledger transaction time wherever the spec says so.
- Keep functions small and name things after the spec's terms (`businessRef`, `docRef`, `AccessSession`).
- Commit in small, conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Never commit `.env` or key material.
- Keep `docs/api.md` and `docs/decisions.md` current as part of each stage.

## B.4 Commands

Fill this list in at the end of Stage 0 and keep it accurate: install, lint, unit test, integration test, e2e test, start all services, reset and seed, Drunix network up and down, benchmark, model training.

## B.5 When blocked

Stop. State what is blocked, what you tried, and 2 or 3 options with their trade-offs. Do not work around a block by weakening a security rule, skipping a test, or inventing an interface.

## B.6 Stage report format

End every stage with this report, then stop.

1. **Done:** what was built, with file paths.
2. **Checks run:** each command and its result (pass, fail, counts).
3. **Not done or deferred:** anything missing and why.
4. **Decisions and deviations:** entries added to `docs/decisions.md`.
5. **Open questions:** anything that needs the human.
6. **Next stage:** its name only.

---

# Part C — Stage prompts

Paste ONE prompt at a time. Wait for the stage report before pasting the next. Human prerequisites are listed above each prompt.

## Stage 0 — Repository and tooling

Human prerequisites: create the empty repository and install Docker, Node.js, Go and Python.

```text
Read docs/SPEC.md sections 1 to 4 and Part B.

Task: scaffold the repository exactly as laid out in section 4.
- Create AGENTS.md from Part B of docs/SPEC.md.
- Create the apps/api NestJS project, apps/web Next.js project, services/risk FastAPI project, chaincode/trustledger Go module, tests/, reports/ and docs/ folders.
- Add docker-compose.yml with PostgreSQL, Nextcloud and the risk service placeholder. The API and web may run locally for now.
- Add lint, format and test commands for each language and wire a GitHub Actions workflow that runs lint and unit tests.
- Add .env.example with every variable you have introduced and no real secrets.
- Add a root README with the honesty statements H-1 to H-8 (section 16.2) and the project purpose.
- Fill in the Commands section of AGENTS.md.

Acceptance: a fresh clone installs, lints and runs the empty test suites with the documented commands. docker compose up starts PostgreSQL and Nextcloud.

Do not touch Drunix or write business logic. End with the stage report from AGENTS.md and stop.
```

## Stage 1 — Drunix discovery and test network

Human prerequisites: clone the Drunix repository into `infra/drunix/` and provide any access instructions that came with the hackathon.

```text
Read docs/SPEC.md sections 3 and 6 and Part B.

Task: discover how Drunix works and get a test network running. Do not guess anything.
- Read the Drunix repository and its documentation. Record in docs/drunix-notes.md, with file paths as evidence: how to start and stop a test network, how to create three orgs (PlatformOrg, BankAOrg, NbfcOrg), ports, how to deploy Go chaincode, the supported Fabric Gateway client for Node and its version, how identities and wallets are created, the endorsement policy syntax, and how read-only evaluate calls obtain their timestamp.
- Create scripts in infra/scripts to bring the network up and down and deploy a trivial chaincode.
- Write a minimal Node script that submits one transaction and evaluates one query as each org.
- Record any difference between the spec and what Drunix supports in docs/decisions.md.

Acceptance: the three-org network starts from scripts, the trivial chaincode deploys, and the Node script succeeds as each org. docs/drunix-notes.md explains how a human repeats every step.

If something is missing or unclear, stop and ask. End with the stage report and stop.
```

## Stage 2 — Chaincode

```text
Read docs/SPEC.md section 6, docs/drunix-notes.md and Part B.

Task: implement chaincode/trustledger in Go exactly as specified in section 6.
- All on-chain records and functions, composite keys, append-only behaviour and the status transition rules in section 10 (D-9).
- Caller identity from the MSP ID, suspended institutions rejected on writes, transaction timestamp as the only clock, the 30-day consent limit, salted-hash and approvalEvidenceHash handling.
- The endorsement policy from section 6, using the syntax recorded in docs/drunix-notes.md.
- Unit tests with a mock stub, including the negative cases listed in section 6 and 15.1.
- Reason codes for CheckAccess as listed in section 11.1.

Acceptance: go vet and go test pass with all negative cases. The chaincode deploys to the Stage 1 network and a script exercises every function as the correct and an incorrect org.

End with the stage report and stop.
```

## Stage 3 — Backend foundation

```text
Read docs/SPEC.md sections 5, 8, 9, 14 and Part B.

Task: build the API foundation in apps/api.
- Prisma schema for section 5 plus the additions in 8.6, migrations, and a seed script that creates the PlatformOrg admin, Bank A and the NBFC with their users, and one demo business owner, using synthetic data.
- Authentication, server-side sessions, CSRF, lockout and the OTP engine with the DevOutboxProvider (sections 8.1 to 8.3).
- Roles, the permission matrix as a single policy module, the three enforcement layers and the table-driven route-by-role test (section 9).
- Audit writing in the same transaction as state changes, with UPDATE and DELETE revoked on audit_events (section 14.1).
- Health endpoint and the dev outbox endpoint.

Acceptance: unit and integration tests pass for login, lockout, session rules, OTP rules (single use, binding, attempts, expiry) and the policy matrix. The log-redaction test (S-16) passes.

Do not implement documents or ledger calls yet. End with the stage report and stop.
```

## Stage 4 — Ledger service, storage and documents

```text
Read docs/SPEC.md sections 3, 6, 7, 10 (W1) and Part B.

Task: build LedgerService, storage and document handling.
- LedgerService interface with a FabricLedgerService using the client validated in Stage 1 and an InMemoryLedgerService for CI. Each org has its own wallet (D-3). Record every transaction in LedgerTx with latency.
- Fail-closed behaviour when the ledger is unreachable (I-1).
- StorageProvider with NextcloudProvider (WebDAV) and LocalFsProvider, and the KeyProvider interface with the environment-variable implementation.
- The upload pipeline, release pipeline and crypto-shredding from section 7. Document state handling from W1 and D-12.
- Ledger contract tests that run the same behaviours against the in-memory fake and the real network.

Acceptance: upload, hash registration, encrypted storage, integrity-checked release, replace and delete work. Tampered ciphertext is denied and audited (S-9). The contract tests pass on both targets.

End with the stage report and stop.
```

## Stage 5 — Consent, share codes and requests

```text
Read docs/SPEC.md sections 8.3, 10 (W2) and Part B.

Task: implement the share-code, request and consent flows.
- Profile share codes with OTP, hashed storage and redemption limits.
- PROFILE consent creation on redemption (D-11), request creation, per-document approval with OTP, partial approval, rejection, cancellation, expiry and revocation.
- Ledger-first consent writes, projection writes after commit, idempotency keys, and the reconciler job.
- Notifications for the events in 14.2.

Acceptance: integration tests cover W2 end to end, including partial approval, expiry, revocation, brute-force lockout on codes (S-10), and idempotent retries. The ledger and PostgreSQL agree after every scenario.

End with the stage report and stop.
```

## Stage 6 — Sessions and document viewing

```text
Read docs/SPEC.md sections 7, 8.4, 10 (W3, W7) and Part B.

Task: implement AccessSessions and the document viewer backend.
- Session creation and OTP activation, fingerprint binding, expiry and revocation evaluated on every request, and the sweeper.
- Server-side rendering of watermarked pages for PDF, PNG and JPEG with the watermark burned into the images (D-6), and download only when approved.
- The ledger access events listed in W3 step 3 and the full audit trail.
- Denials with reason codes.

Acceptance: security tests S-1 to S-5, S-7, S-8, S-15 and S-18 pass. A forwarded session URL fails. Expiry and revocation deny access immediately.

End with the stage report and stop.
```

## Stage 7 — Attestations and cross-institution lookup

```text
Read docs/SPEC.md sections 6, 10 (W3 steps 4 to 6, W5) and Part B.

Task: implement KYC reviews, attestations and lookup.
- KycReview records, attestation issuance with docHashSnapshot built from documents actually viewed in the session, and the suspend and revoke transitions (D-9).
- Attestation lookup through a PROFILE consent as the NBFC, with the filtered response and the documentsUnchangedSinceAttestation field.
- Confirmation that KycReview notes and assessments never appear in lookup responses.

Acceptance: integration tests cover issuing, lookup by a second institution, suspension, revocation, expiry computation and the "changed since verified" case after a document replacement.

End with the stage report and stop.
```

## Stage 8 — Risk service

Human prerequisites: decide whether to use the synthetic generator or a public dataset, and provide the dataset if the latter.

```text
Read docs/SPEC.md sections 4, 10 (W4), 12 and Part B.

Task: build services/risk and integrate it.
- The data pipeline (synthetic generator by default), splits, baseline and candidate models, calibration, bands and explanations as in section 12.
- The FastAPI service, internal token, strict validation and warnings.
- The evaluation script that writes reports/model-metrics.json from the held-out test set, and docs/model-card.md.
- In apps/api: financial profiles, draft assessments, review and finalisation, reportHash, and RecordAssessment on the ledger.

Acceptance: pytest passes including the monotonic sanity test. make train reproduces the artifacts. The API flow from features to a finalised assessment works and only finalised assessments reach the ledger. S-17 passes. All outputs are labelled synthetic where applicable.

Report the metric values exactly as the script produced them. End with the stage report and stop.
```

## Stage 9 — Web application

```text
Read docs/SPEC.md sections 9, 10, 13 and Part B.

Task: build the three dashboards in apps/web against the real API.
- All screens in 13.1, the required notices N-1 to N-5, the prototype banner and the UX and security requirements in 13.3.
- Role-aware navigation, OTP inputs, the document viewer with expiry countdown, and the per-document approval screen.
- No direct calls from the browser to the ledger, Nextcloud or the risk service.

Acceptance: a Playwright smoke test walks the demo journey in 17.2 up to step 8 using the dev outbox for OTPs. Lint, type checks and the existing test suites pass.

End with the stage report and stop.
```

## Stage 10 — Verification, benchmarks and metrics

```text
Read docs/SPEC.md sections 15, 16 and Part B.

Task: produce verified results.
- Automate S-1 to S-18 and write reports/security-tests.md from the actual results, including dependency audit output.
- Build the Drunix benchmark and k6 scenarios from section 15.3. Run them on the real network and write raw data to reports/raw/.
- Generate reports/metrics.md by script from the raw data, with the environment record. Mark anything not measured as "not measured".
- Measure the scripted multi-institution flow time and the upload-reduction scenario.

Acceptance: the reports exist and every number traces to a raw file. No number is typed by hand.

Report the results exactly as measured, including failures. End with the stage report and stop.
```

## Stage 11 — Hardening, documentation and demo

```text
Read docs/SPEC.md sections 16, 17 and Part B.

Task: finish for the demo.
- Fix open findings from Stage 10 or document them honestly.
- Complete the README: one-command start, seeded demo, honesty statements H-1 to H-8, architecture diagram and links to the reports.
- Update docs/api.md, docs/decisions.md, docs/drunix-notes.md and docs/model-card.md.
- Add a script that resets and reseeds the demo data and brings the full stack up.
- Walk through the demo script in 17.2 and list any step that does not work.

Acceptance: the definition of done in 17.1 is met, or every gap is listed explicitly in the report.

End with the final stage report and stop.
```

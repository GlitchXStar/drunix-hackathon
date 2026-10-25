# Architectural Decisions Record (ADR)

This file records all architectural decisions, invariant justifications, and approved deviations from the baseline specification.

## Initial Decisions (from SPEC.md)

- **D-1 StorageProvider abstraction:** Storage sits behind a `StorageProvider` interface with a `NextcloudProvider` (WebDAV) and a `LocalFsProvider` (dev and tests). A Nextcloud setup problem must never block progress.
- **D-2 Envelope encryption:** Application-layer envelope encryption happens in NestJS before any file reaches storage, so Nextcloud never sees plaintext.
- **D-3 Multi-org prototype backend:** The Drunix test network has three orgs: `PlatformOrg`, `BankAOrg`, `NbfcOrg`. One backend holds a wallet per org and submits each transaction as the acting org, so endorsement and caller checks are real. In production each institution would run its own gateway.
- **D-4 PlatformOrg consent submission:** Business-side consent is submitted to the ledger by `PlatformOrg` on the business's behalf, after the backend has verified the business owner's OTP approval.
- **D-5 Pseudonymous business identifier:** The on-chain business identifier is a random pseudonymous UUID (`businessRef`). GSTIN, PAN and names never go on-chain.
- **D-6 Server-rendered watermarked viewing:** Document viewing is view-only by default (no download), with a watermark naming the institution, officer and time burned into server-rendered image pages. Download is allowed only if requested and approved.
- **D-7 Credit-risk decision support:** Credit-risk output is decision support only. The system never makes an automatic KYC or lending decision.
- **D-8 Profile share codes:** Institutions find a business through a short-lived profile share code that the business generates. There is no open search over businesses.
- **D-9 Attestation lifecycle:** `VALID` -> `SUSPENDED` or `REVOKED`. No reinstatement; an institution issues a new attestation instead.
- **D-10 Document request scoping:** Institutions request documents by `docType`; the business chooses which concrete documents to share.
- **D-11 Share code as profile consent:** The profile share code doubles as the business's PROFILE consent. Redeeming it creates a PROFILE consent for the redeeming institution only.
- **D-12 Active consent protection:** Replacing or deleting a document is blocked (HTTP 409) while any ACTIVE consent references it.
- **D-13 Synthetic risk training data:** The default risk model uses a deterministic synthetic data generator with a fixed random seed and documented data generation process.

## Deviations & User-Approved Additions

- **D-14 Primary database selection (MongoDB):**
  - **Context:** User requested MongoDB as the primary operational database instead of PostgreSQL.
  - **Decision:** Use MongoDB as the primary operational database, interfaced via Prisma with the MongoDB provider (`provider = "mongodb"`).
  - **Rationale:** Aligns with project requirements while retaining Prisma type safety, schema definitions, and migration/generation workflows.
  - **Status:** Approved by User.
- **D-15 Binary vs JSON API clarification:**
  - **Context:** API is JSON-only by default, but file upload, watermarked viewing, and downloads require binary/multipart.
  - **Decision:**
    - Standard operations: JSON request/response.
    - File upload: `multipart/form-data` on `POST /business/documents`.
    - Document viewing: `image/png` stream on `GET /institution/sessions/:id/documents/:docRef/pages/:page`.
    - Document download: `application/octet-stream` on `GET /institution/sessions/:id/documents/:docRef/download`.
  - **Status:** Approved.
- **D-16 Drunix peer role decoupling (Lite Peer & Committing Peer):**
  - **Context:** Stage 1 discovery of `npci/drunix` reveals that Drunix separates peers into Lite Peers (LP) for endorsement and Committing Peers (CP) for block validation/commitment.
  - **Decision:** Client applications and Fabric Gateway connect directly to the Lite Peer (LP) endpoints (`peer0.org1:7051`, etc.) for transaction simulation and endorsement, while block commit and MVCC checks are handled asynchronously by CP and the stateless Validation Service (VS).
  - **Status:** Documented and verified.
- **D-17 Drunix SQL database (YugabyteDB) & KeyDB transient store:**
  - **Context:** Drunix supports distributed SQL (YugabyteDB on port 5433) for state data and KeyDB (port 6379) for transient private data sharing.
  - **Decision:** TrustLedger chaincode uses standard composite key JSON serialization compatible with both standard Fabric stubs and Drunix SQL-backed state databases.
  - **Status:** Documented and verified.
- **D-18 Ledger and Storage provider abstraction architecture:**
  - **Context:** Stage 4 requires dynamic ledger targeting (`InMemoryLedgerService` for offline CI/dev, `FabricLedgerService` for live Drunix network) and storage provider decoupling (`LocalFsProvider` and `NextcloudProvider` WebDAV).
  - **Decision:** Factory providers for `LEDGER_SERVICE` and `STORAGE_PROVIDER` dynamically select between concrete implementations via environment configuration (`LEDGER_TYPE`, `STORAGE_PROVIDER`). `EnvKeyProvider` provides AES-256-GCM master key envelope encryption standing in for a production KMS/HSM (per N-5, D-2). Fail-closed behavior (I-1) is strictly enforced if any ledger target is unreachable.
  - **Status:** Implemented and verified in Stage 4.
- **D-19 Crockford Base32 alphabet and normalization for profile share codes:**
  - **Context:** SPEC 10 W2 step 1 specifies an 8-character code from an unambiguous 32-symbol alphabet, shown once to the business owner, with only `codeHash = SHA-256(code)` stored.
  - **Decision:** Implement Crockford Base32 with canonical 32 symbols: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (10 digits + 22 letters excluding confusing glyphs `I`, `L`, `O`, `U`). Input normalization on redemption maps `O` -> `0` and `I`/`L` -> `1`, ensuring robustness against visual misreading.
  - **Status:** Implemented and verified in Stage 5.
- **D-20 Brute-force rate limiting (S-10) for share-code redemption:**
  - **Context:** SPEC 8.5 & S-10 requires brute-force lockout on share-code redemption attempts.
  - **Decision:** Enforce dual-level rate limiting in `ShareCodeService`: maximum 5 attempts per minute per officer user (1-minute lockout), and maximum 20 attempts per hour per institution (1-hour lockout). Exceeding these limits immediately returns HTTP 429 (`TOO_MANY_REQUESTS`).
  - **Status:** Implemented and verified in Stage 5.
- **D-21 Ledger-first consent write & reconciler projection recovery (I-1, I-2):**
  - **Context:** Stage 5 requires that consent is written ledger-first (`CreateConsent` on chain) before writing local database projections (`ConsentGrant`). If the ledger commit fails, the request remains in `PENDING` state (W2 step 5).
  - **Decision:** All approvals submit on-chain transactions via `PlatformOrgMSP` with an immutable `approvalEvidenceHash = SHA-256(challengeId:approvalTime:userId:requestId)`. Local `ConsentGrant` records are only created upon receipt of the on-chain transaction ID. A background `ReconcilerService` sweeps unanswered requests older than 7 days to `EXPIRED` status (W2 step 7) and reconciles any missing local database projections from ledger query state (I-2).
- **D-22 Backend Repository Reorganization (Pre-Push Hygiene):**
  - **Context:** Backend components were previously split across `apps/api`, `services/risk`, and `chaincode/trustledger`. To establish clean ownership boundaries (preserving `apps/web/` exclusively for Frontend) and provide a coherent project structure before GitHub push, the backend components were organized into a unified `backend/` directory.
  - **Decision:**
    - Relocate `apps/api` -> `backend/api`.
    - Relocate `services/risk` -> `backend/risk-service`.
    - Relocate `chaincode/trustledger` -> `backend/chaincode/trustledger`.
    - Keep `apps/web/` untouched under `apps/` for frontend ownership.
    - Update npm workspaces (`backend/api`, `apps/*`), lockfile, CI workflows, docker-compose build context, chaincode deploy scripts, and documentation paths.
  - **Status:** Implemented and verified.
- **D-23 Server-side document rendering and watermark burning engine (@napi-rs/canvas & pdfjs-dist):**
  - **Context:** SPEC §7, D-6, and S-6 require server-side rasterization for PDF, PNG, and JPEG documents with a security watermark (`${institutionName} · ${officerEmail} · ${timestampUtc}`) burned directly into the image pixel buffer (a CSS overlay alone is strictly prohibited). Plaintext must never touch persistent storage, and rendering must avoid OS-level GTK/Cairo native package installation issues across Windows, Linux, and containerized targets.
  - **Decision:**
    - Use `@napi-rs/canvas` (Rust-based Skia canvas bindings with prebuilt native binaries for all major platforms) for fast, zero-dependency server-side 2D drawing, image decoding/re-encoding, and diagonal watermark burning.
    - Use `pdfjs-dist` (Mozilla PDF.js legacy Node.js build) for pure JavaScript/WebAssembly server-side PDF page parsing and rasterization into the Skia canvas.
    - Limit rendering dimensions to `MAX_DIMENSION = 2048px` to mitigate denial-of-service risks (memory exhaustion).
    - Watermark format: `${institutionName} · ${officerEmail} · ${timestampUtc}` rendered with semi-transparent fill (`rgba(220, 38, 38, 0.30)`) rotated at -30 degrees diagonally across the entire page canvas.
  - **Status:** Implemented and verified in Stage 6.



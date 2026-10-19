# TrustLedger — Project Roadmap

Source of truth: `docs/SPEC.md`

## Milestone 1: Core Platform & Drunix Integration

### Phase 0: Repository and tooling
- [x] Scaffold repository layout (apps/api, apps/web, services/risk, chaincode, infra, docs, reports)
- [x] Configure linting, formatting, tests, and CI workflow
- [x] Verify API unit tests, e2e health checks, and risk service tests

### Phase 1: Drunix discovery and test network
- [x] Inspect Drunix repository in `infra/drunix/` and record findings in `docs/drunix-notes.md`
- [x] Network up/down scripts in `infra/scripts/` for 3-org topology (PlatformOrg, BankAOrg, NbfcOrg)
- [x] In-memory multi-org transaction/query test script (`npm run test:drunix`)
- [ ] Live 3-org Drunix container startup & on-chain verification (BLOCKED: Docker unavailable on host)

### Phase 2: Chaincode
- [ ] Implement Go chaincode in `chaincode/trustledger/`
- [ ] Unit tests with mock stub for all transitions and security negative cases

### Phase 3: Backend foundation
- [ ] Prisma schema & seed script
- [ ] Auth, sessions, CSRF, lockout, and OTP engine with DevOutbox
- [ ] Permission matrix and audit log engine

### Phase 4: Ledger service, storage and documents
- [ ] LedgerService (Fabric & InMemoryCI)
- [ ] StorageProvider (Nextcloud & LocalFs) with AES-256-GCM envelope encryption
- [ ] Upload, integrity release, crypto-shredding

### Phase 5: Consent, share codes and requests
- [ ] Profile share codes and OTP redemption
- [ ] Request lifecycle and granular document approval

### Phase 6: Sessions and document viewing
- [ ] AccessSessions with OTP activation and browser fingerprinting
- [ ] Server-rendered watermarked document viewer

### Phase 7: Attestations and cross-institution lookup
- [ ] KYC review attestations and verification hash snapshots
- [ ] Cross-institution attestation queries

### Phase 8: Risk service
- [ ] Synthetic data generation and risk scoring pipeline
- [ ] FastAPI evaluation service and ledger assessment reference

### Phase 9: Web application
- [ ] Business, Bank, and NBFC dashboards in `apps/web/`
- [ ] Verification demo flow

### Phase 10: Verification, benchmarks and metrics
- [ ] Automated security tests S-1 to S-18
- [ ] Drunix TPS and latency benchmarking

### Phase 11: Hardening, documentation and demo
- [ ] Final audit, seeded demo reset script, and documentation signoff

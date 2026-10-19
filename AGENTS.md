# Part B — Working agreement for the coding agent

Copy of Part B from docs/SPEC.md.

## B.1 Operating rules

1. `docs/SPEC.md` is the source of truth. Read the relevant sections before each stage. If the spec is ambiguous or contradicts itself, stop and ask. Do not guess.
2. Work on ONE stage at a time. When the stage's acceptance checks pass, write the report and STOP. Do not start the next stage.
3. Stay inside the stage's scope. Do not add features, services or dependencies that the spec does not call for. Record any needed deviation in `docs/decisions.md` with the reason and wait for approval if it changes an invariant (I-n), a design decision (D-n), or a non-goal.
4. Never guess or invent Drunix commands, ports, APIs or client versions. Read the Drunix repository and documentation. Record what you found, with file paths, in `docs/drunix-notes.md`.
5. Never fabricate results. Metrics, test counts and model scores must come from commands you ran. If something was not run, say "not run".
6. Never claim a feature works unless you ran a test or command that shows it. Include the command and its relevant output in the report.

## B.2 Invariants you must not break

- **I-1 Ledger-first.** Before releasing any document or session, the backend reads consent and attestation state from the ledger. If the ledger is unreachable, access is denied (fail closed).
- **I-2** Database is a projection and workflow store. If it disagrees with the ledger on consent or attestation status, the ledger wins.
- **I-3** No document bytes, keys, OTPs, raw financial features or direct personal identifiers are ever written to the ledger.
- **I-4** The ML service never receives documents. It receives only validated structured features.
- **I-5** Access requires an authenticated officer of an ACTIVE institution. An OTP or a link alone is never sufficient.
- **I-6** Every material state change produces an audit record. Secrets, OTP values and keys are never logged.

## B.3 Engineering standards

- TypeScript strict mode. ESLint and Prettier are mandatory. Go code passes `gofmt` and `go vet`. Python code passes `ruff` and `black`.
- Validate all external input with an allow-list. Reject unknown fields.
- Use parameterised queries through Prisma.
- Pin dependency versions. Add a dependency only when needed and note why in `docs/decisions.md`.
- Every security-relevant behaviour gets an automated test, including the negative case.
- Use UTC and the ledger transaction time wherever the spec says so.
- Keep functions small and name things after the spec's terms (`businessRef`, `docRef`, `AccessSession`).
- Commit in small, conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Never commit `.env` or key material.
- Keep `docs/api.md` and `docs/decisions.md` current as part of each stage.

## B.4 Commands

- **Install dependencies:** `npm run install:all` (or `npm install` at root, `cd backend/api && npm install`, `cd backend/risk-service && pip install -r requirements.txt`)
- **Lint all:** `npm run lint`
- **Unit test all:** `npm test`
- **Integration test:** `npm run test:integration`
- **E2E test:** `npm run test:e2e`
- **Start infrastructure:** `docker compose -f infra/docker-compose.yml up -d`
- **Stop infrastructure:** `docker compose -f infra/docker-compose.yml down`
- **Reset and seed database:** `npm run db:reset && npm run db:seed`
- **Drunix network up:** `powershell -File infra/scripts/drunix-up.ps1`
- **Drunix network down:** `powershell -File infra/scripts/drunix-down.ps1`
- **Drunix benchmark:** `npm run test:benchmark`
- **Model training:** `cd backend/risk-service && python -m src.train`

## B.5 When blocked

Stop. State what is blocked, what you tried, and 2 or 3 options with their trade-offs. Do not work around a block by weakening a security rule, skipping a test, or inventing an interface.

## B.6 Stage report format

End every stage with this report, then stop:

1. **Done:** what was built, with file paths.
2. **Checks run:** each command and its result (pass, fail, counts).
3. **Not done or deferred:** anything missing and why.
4. **Decisions and deviations:** entries added to `docs/decisions.md`.
5. **Open questions:** anything that needs the human.
6. **Next stage:** its name only.

# TrustLedger — Benchmark & Technical Metrics Report

> **Rule:** All numbers MUST come from actual test runs on the Drunix test network and API benchmarks. Unmeasured values are marked not measured.

## Test Environment
- **Hardware:** Not recorded yet
- **Operating System:** Windows / Docker
- **Drunix Topology:** 3 Orgs (PlatformOrg, BankAOrg, NbfcOrg)
- **Execution Date:** Not run yet

## 1. Technical Performance Metrics
| Metric | Definition | Target | Measured Result |
| :--- | :--- | :--- | :--- |
| Drunix committed TPS | Successfully committed transactions / measurement window | Benchmark | not measured |
| Drunix latency (p50 / p95 / p99) | Submit-to-commit roundtrip | Benchmark | not measured |
| Document upload latency (p50 / p95) | Encrypt, store, fingerprint, ledger register | Latency | not measured |
| Document retrieval latency (p50 / p95) | Ledger check, fetch, decrypt, verify hash | Latency | not measured |
| End-to-end authorization latency | Approval OTP to active session view | Latency | not measured |
| API error rate | Unexpected non-2xx responses / total requests | < 0.1% | not measured |
| Multi-institution flow time | Wall-clock time for W1 to W7 full flow | Scripted | not measured |
| Upload reduction | MSME single vault vs 3 separate institution uploads | n vs 3n | not measured |

## 2. Model Metrics (Held-out Test Set)
- **Status:** not measured (Training scheduled in Stage 8)
- **Notice:** All synthetic outputs will be labeled synthetic.

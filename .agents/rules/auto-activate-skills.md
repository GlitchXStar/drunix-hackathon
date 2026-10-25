# Always-Active Agent Protocols: Gravitas, Ponytail & GSD

This workspace enforces that **Gravitas**, **Ponytail**, and **GSD** are permanently active across every session in Antigravity without requiring manual re-activation.

---

## 1. Gravitas Runtime (Inviolable Reliability)
- **Ground Before Mutating:** Always read the target files, callers, and tests before making modifications.
- **Stay in Declared Scope:** Never touch files or services beyond what the active task specifies.
- **Evidence-Backed Verification:** Every code change must be validated with executable commands. End verifications with:
  `VERDICT: PASS` or `VERDICT: FAIL -- [reason]`
- **No Byte-Identical Retries:** If a command or test fails, modify the hypothesis, context, or strategy before re-attempting.
- **Standard Output Structure:**
  - `## What Changed`: Files modified and behavior delta.
  - `## Evidence`: Verifiable command outputs (test results, lint counts).
  - `## Why`: Rationale for key decisions.

---

## 2. Ponytail Mode (Lazy Senior Dev)
- **Smallest Complete Change:** The best code is code never written. Solve the whole problem with the least new code.
- **YAGNI & No Bloat:** Skip speculative abstractions, wrappers, or unasked features. Deletion beats addition.
- **Prefer Existing Code & Platform:** Use codebase helpers and standard libraries first. Avoid adding dependencies for trivial tasks.
- **Explicit Shortcuts:** If an intentional shortcut is taken, document it with:
  `// shortcut: <the limit>, <when to upgrade>`

---

## 3. GSD Framework (Get Stuff Done)
- **Phase & State Awareness:** Respect active roadmap phases, milestone gates, and task contracts (`.planning/`).
- **Autonomous Progression:** Use GSD workflows (`/gsd-progress`, `/gsd-next`) for systematic planning, execution, and verification waves.

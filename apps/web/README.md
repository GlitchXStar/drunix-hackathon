# TrustLedger Frontend

TrustLedger is a Next.js App Router prototype for consent-based MSME verification. It demonstrates how a Business Owner, institutional officers, Institution Admins, and Platform Super Admins move through purpose-bound verification workflows without presenting consent, attestations, or decision support as automatic approval.

All visible information is synthetic. This frontend is a static prototype: it has no production authentication, API calls, ledger calls, file uploads, OTP delivery, or browser-side persistence of sensitive data.

## Technology

- Next.js 15 with the App Router
- React 19 and TypeScript
- Plain CSS in `app/globals.css`
- ESLint with `eslint-config-next`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Repository placement

In the shared monorepo, this application belongs at `apps/web/`. The current `frontend/` directory is the local working copy used to develop that application. Do not keep two diverging frontend source trees.

```text
apps/web/                 Published frontend location in the monorepo
  app/                    Routes, styles, and page-specific UI
  app/globals.css         Shared design system and responsive rules
  app/a11y.css            Focus and screen-reader utilities
  app/layout.tsx          Root document metadata and global styles
  design.md               Design-system reference
  package.json            Frontend scripts and dependencies
```

Role sidebars are currently implemented in individual route files so screens can evolve quickly. Consolidating them into role-aware shared components is a later cleanup once real authentication and server-side routing are introduced.

## Implemented routes

### Public

- `/` - TrustLedger landing page
- `/login` - shared sign-in
- `/register` - Business Owner registration

### Business Owner

- `/business/profile` - business profile and changed-since-verified context
- `/business/documents` - document vault
- `/business/documents/upload` - upload and registration state
- `/business/documents/GST-001` - document version, replace, and delete state
- `/business/share-codes` - profile share codes and owner OTP confirmation UI
- `/business/requests` - incoming verification requests
- `/business/requests/VR-2026-0184` - item-level consent decision scope
- `/business/consents` - active and historic consents
- `/business/access-history` - consented access history
- `/business/verification-history` - attestation and verification history
- `/business/notifications` - business notifications
- `/business/employees` - employee roles and owner-only boundaries

### KYC Officer

- `/institution/redeem` - profile share-code redemption
- `/institution/requests` - verification-request inbox
- `/institution/requests/new` - verification request composer
- `/institution/requests/VR-2026-0184` - request status and approved evidence scope
- `/institution/session-activation` - officer OTP session-activation UI
- `/institution/access-session` - time-bound, watermarked document-viewing environment
- `/institution/kyc-review` - private checklist, review outcome, and internal notes
- `/institution/attestations` - consent-limited attestation evidence review
- `/institution/attestations/issue` - KYC_BASIC issuance draft with viewed-document hash snapshot
- `/institution/attestations/manage` - issuer-owned attestation lifecycle
- `/institution/attestations/lookup` - cross-institution, consent-limited attestation lookup

### Loan Officer

- `/institution/financial-profile` - structured financial-profile input
- `/institution/risk-assessment` - assessment draft and input snapshot
- `/institution/risk-review` - synthetic report review, factors, and officer-note step
- `/institution/risk-assessment/finalise` - finalisation confirmation

### Compliance Officer

- `/institution/compliance-review` - consent, session, integrity, and policy review workspace
- `/institution/audit` - tenant-scoped metadata-only audit trail

### Institution Admin

- `/institution/employees` - tenant employee management
- `/institution/employees/invite-success` - one-time temporary-password success state
- `/institution/employees/audit` - employee and role-change audit trail
- `/institution/settings` - tenant identity and operational-default settings
- `/institution/notifications` - institution notifications

### Platform Super Admin

- `/admin` - platform operations overview
- `/admin/institutions` - institution tenant list
- `/admin/institutions/new` - tenant and first-admin onboarding form
- `/admin/institutions/new/success` - first-admin success state with one-time temporary password
- `/admin/institutions/status` - suspend/reactivate confirmation state
- `/admin/users` - platform user and role directory
- `/admin/audit` - metadata-only platform audit trail
- `/admin/policies` - operational policy controls and fixed security guardrails
- `/admin/health` - dependency health and ledger-unavailable fail-closed state

## Workflow coverage

The prototype presents these primary journeys:

1. A Business Owner maintains a profile and document vault, produces an owner-approved share code, then receives and decides item-level verification requests.
2. An institutional KYC Officer redeems consent, activates a restricted session with an OTP UI, views approved evidence, records a private KYC review, and prepares an attestation from documents viewed during that session.
3. A Loan Officer enters a structured financial profile, prepares a synthetic assessment, reviews its factors, records an internal note, and reaches finalisation confirmation.
4. A Compliance Officer reviews consent/session context and accesses only Bank A's metadata audit trail.
5. An Institution Admin manages tenant staff, operational defaults, and one-time employee credentials.
6. A Platform Super Admin onboards institutions, changes tenant eligibility, controls permitted operational defaults, and observes fail-closed dependency health.

## Design and safety rules represented in the UI

- The visual system uses dark operational sidebars, neutral content surfaces, high-contrast controls, responsive grids, and visible keyboard focus styles.
- Consent is distinct from an attestation. Consent controls access; an attestation is issuer evidence, not a document-release mechanism or decision.
- KYC notes, risk work, and original documents are not shown in cross-institution attestation lookup.
- Only documents actually viewed in a session appear in the attestation-issue snapshot.
- OTP controls show expiry and attempt-limit concepts, but never display, save, or log real OTPs.
- Document access is described as time-bound, purpose-bound, view-only, auditable, and subject to future server-side re-authorisation.
- Risk outputs are labelled synthetic decision support; they do not approve, decline, price, or otherwise automate lending outcomes.
- Tenant suspension and ledger-unavailable states are shown as fail-closed for protected access.
- One-time temporary-password screens state that the credential must not be retained in browser storage, lists, or audit metadata.
- Audit screens display metadata only and explicitly exclude secrets, OTPs, credentials, document bytes, and raw financial features.

## Current prototype boundaries

Forms and buttons are intentional presentation states until backend contracts are connected. Do not infer that any local UI action changes records, verifies OTPs, activates sessions, uploads files, grants consent, issues attestations, or finalises an assessment.

The document viewer provides a visual watermark and copying deterrent only. A production implementation must render documents through a server-authorised, no-store response with a burned-in watermark and a ledger-backed access check on every protected release.

## Remaining implementation work

There are no planned role-based screens remaining. The next work is shared integration and production hardening:

- Authentication, server-side sessions, CSRF protection, and role-aware route protection
- API client, backend contracts, loading states, empty states, error states, and real data
- Real OTP issue/verify flows with entity binding, expiry, attempt limits, and safe delivery
- Real document upload, encrypted storage, integrity verification, versioning, and delete workflows
- Ledger-first consent, session, attestation, and assessment state transitions
- Server-authorised, watermarked document-page rendering and download enforcement
- Real notifications and audit-event feeds
- Playwright end-to-end coverage for the consent journey and critical failure paths
- Accessibility QA, browser/device testing, and deployment configuration

## Publishing notes

The frontend `.gitignore` excludes dependencies, build output, local environment files, logs, and editor configuration. Publish frontend source only; never commit `node_modules`, `.next`, secret `.env` files, OTPs, temporary passwords, document data, or backend-only credentials.

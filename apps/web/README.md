# TrustLedger Frontend

Next.js App Router frontend for the TrustLedger consent-based MSME verification prototype.

## Run locally

```bash
npm install
npm run dev
```

The local app runs at `http://localhost:3000` by default.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Structure

```text
app/
  page.tsx                         Landing page
  login/                           Shared sign-in
  register/                        MSME registration
  business/                        Business Owner workspace
  institution/                    Institution, KYC, and Institution Admin screens
  admin/                           Platform Super Admin screens
  globals.css                      Shared visual system and responsive styles
  a11y.css                         Shared focus and screen-reader utilities
assets/                            Frontend assets (currently unused)
design.md                          Project design-system reference
```

Routes use the Next.js App Router. The current role sidebars are implemented in-page; extracting them into shared components is a sensible next cleanup once the remaining screens are built.

## Implemented screens

### Public

- `/` — landing page
- `/login` — shared sign-in
- `/register` — Business Owner registration

### Business Owner

- `/business/profile` — business profile and changed-since-verified context
- `/business/documents` — document vault
- `/business/documents/upload` — upload and registration states
- `/business/documents/GST-001` — version, replace, and delete states
- `/business/share-codes` — profile share codes and owner OTP confirmation
- `/business/requests` — incoming verification requests
- `/business/requests/VR-2026-0184` — per-document approval scope
- `/business/consents` — active and historic consents
- `/business/access-history` — consented access audit history
- `/business/verification-history` — issuer and attestation history
- `/business/notifications` — business notifications
- `/business/employees` — employee roles and owner-only boundaries

### Institution / KYC Officer

- `/institution/redeem` — profile share-code redemption
- `/institution/requests/new` — verification request composer
- `/institution/requests/VR-2026-0184` — request status and item-level consent state
- `/institution/attestations` — attestation review
- `/institution/access-session` — controlled document access session
- `/institution/risk-review` — decision-support context

### Institution Admin

- `/institution/employees` — tenant employee management
- `/institution/notifications` — institution notifications

### Platform Super Admin

- `/admin` — operational overview
- `/admin/institutions` — institution tenants
- `/admin/institutions/new` — institution and first-admin onboarding
- `/admin/users` — user and role directory
- `/admin/audit` — metadata-only platform audit trail

## Current prototype behavior

The screens are static UI prototypes. Buttons and forms are intentionally presentational until the backend contracts are connected. No browser-side calls are made to the ledger, file storage, or risk service. Do not store tokens, OTPs, or document data in browser storage when integration begins.

The document-viewer screen includes visual copying deterrents and explicit limits. Production document pages must be server-rendered with a burned-in watermark and re-authorized by the backend for every access request.

All visible demo information is synthetic. The UI must not present risk context as an automated lending decision or imply production readiness.

## Remaining frontend scope

### KYC Officer

- Request list
- Officer session activation with OTP
- KYC review form
- Attestation issue, management, and lookup
- Institution-scoped audit view

### Loan Officer

- Financial profile form
- Risk assessment draft and run flow
- Risk report review
- Assessment finalisation

### Compliance Officer

- Compliance review workspace
- Institution-scoped audit trail

### Institution Admin

- Tenant settings
- Invite success screen with temporary password shown once
- User-management audit

### Platform Super Admin

- Suspend/reactivate institution confirmation flow
- Institution Admin creation success flow
- Policy controls
- Detailed service-health and ledger-unavailable states

### Shared integration work

- Authentication and server-side role-aware routing
- API client and real backend data
- Loading, empty, error, and ledger-unavailable states
- Real OTP flows, document upload, consent mutation, and notifications
- Server-authorized, watermarked document-page rendering
- Playwright end-to-end coverage for the consent journey

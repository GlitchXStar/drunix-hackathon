# apps/web — TrustLedger Frontend Application

## Ownership
- **Owner:** Person 1 (Frontend Developer)
- **Framework:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **Dashboards:**
  1. `(admin)`: Platform Super Admin Dashboard
  2. `(institution)`: Bank & NBFC Dashboard
  3. `(business)`: MSME Business Owner Dashboard

## API Integration Contract
- Do not make direct browser connections to Drunix, Nextcloud, or the FastAPI risk service.
- All requests communicate with the NestJS API at `/api/v1` using session cookies.
- Refer to `docs/api.md` and the OpenAPI documentation at `http://localhost:3001/api/docs` for authoritative schemas, endpoints, and error formats.

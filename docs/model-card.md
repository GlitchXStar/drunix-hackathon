# Model Card — TrustLedger Credit Risk Assessment Model

## Model Details
- **Developer:** TrustLedger Team (Person 2 - Backend & ML)
- **Model Type:** Scikit-Learn (LogisticRegression baseline / HistGradientBoostingClassifier candidate)
- **Model Version:** `v1-synthetic-initial`
- **Inference Engine:** Python FastAPI microservice (`backend/risk-service`)

## Intended Use
- **Primary Use:** Decision support for loan officers evaluating MSME creditworthiness based on 13 structured financial features.
- **Out of Scope (Non-Goals):**
  - Not for identity verification or automated KYC.
  - Not an automated lending approval/rejection decision.
  - Not proof of fraudulent activity.
  - Never ingests raw document bytes, names, PAN, or GSTIN.

## Training Data & Evaluation Notice
- **Data Source:** Synthetic deterministic dataset generated via `backend/risk-service/data/generate.py`.
- **Target Variable:** Serious delinquency (90+ DPD) within 12 months.
- **Notice (H-5 / N-3):** All results, scores, and bands generated from synthetic data are explicitly labeled as **SYNTHETIC** across all dashboards, APIs, and reports. They do not constitute evidence of real-world lending performance.

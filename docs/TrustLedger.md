# TrustLedger — Consent-Based MSME Verification & Credit Risk Assessment on Drunix

Working Project Name: TrustLedger

Hackathon: NPCI × Drunix

Primary Track: Financial Inclusion

Secondary Alignment: Real-Time Payments (optional extension)

Tagline: Verify with trust. Share with consent. Assess risk with evidence.

## 1. Project Overview

TrustLedger is a privacy-focused platform designed to simplify KYC verification, secure document sharing and credit-risk assessment for Micro, Small and Medium Enterprises (MSMEs).

When a business approaches multiple banks or Non-Banking Financial Companies (NBFCs), it may need to submit the same documents repeatedly and undergo separate verification processes. Financial institutions also need to establish the authenticity of documents, maintain their own compliance processes and assess the creditworthiness of businesses before lending.

TrustLedger introduces a shared verification and authorization layer powered by NPCI Drunix. Businesses can upload their documents into a secure document vault, undergo verification by participating financial institutions, and authorize other institutions to access selected documents through restricted, time-limited sessions.

The platform also incorporates a machine-learning-based credit-risk assessment system. Instead of sending customers' raw documents to an LLM, authorized financial features are processed by a separate ML model to estimate potential repayment risk.

Drunix maintains shared verification, authorization and audit-related records, while Nextcloud stores the actual documents and the application backend manages authentication, permissions and business workflows.

The goal is to reduce repeated verification work, minimize unnecessary document disclosure, improve transparency and provide financial institutions with additional evidence for their decisions.

## 2. Problem Statement

MSMEs frequently interact with multiple financial institutions to open accounts, obtain business loans, access working capital and secure other financial services.

This creates several challenges:

- Repeated KYC and document submission: Businesses may need to submit similar documents repeatedly to different institutions.

- Fragmented verification: A verification performed by one institution may not automatically be accepted by another.

- Limited control over document sharing: Businesses may disclose more information than the requesting institution actually needs.

- Privacy and security risks: Unrestricted links and excessive document copies can expose sensitive business information.

- Inconsistent credit assessment: Different institutions may use different data and methods to assess the financial risk of a business.

- Limited auditability: It can be difficult to establish who requested a document, what the user authorized and which institution performed a verification.

TrustLedger addresses these challenges through reusable verification records, customer-controlled document access, auditable authorization and experimental ML-assisted credit-risk assessment.

## 3. Proposed Solution

The platform consists of three dashboards supported by a common backend, an encrypted document-storage system, a machine-learning service and NPCI

Drunix.

## A. Admin Dashboard

The Admin Dashboard manages platform operations and institutional onboarding.

## Main features

- Register and manage participating banks, NBFCs and other authorized financial institutions.

- Activate or suspend institution accounts according to platform onboarding rules.

- Create and manage employee accounts belonging to each institution.

- Assign roles and permissions.

- Configure institution-level access policies and authentication settings.

- Monitor platform activity, failed login attempts and suspicious access patterns.

- View verification records, transaction references and relevant audit events.

- Monitor system health and integration status.

Security principle: Platform administrators should not automatically receive unrestricted access to customer documents. Administrative access and sensitive document access must remain separate permissions.

## B. Bank / Financial Institution Dashboard

This dashboard allows financial institutions to manage verification requests, review authorized documents and assess business risk.

## Main features

- View and manage the institution's employee accounts.

- Search for a business using an appropriate identifier or customer-authorized reference.

- View relevant verification attestations issued by participating institutions, subject to the applicable permissions.

- Initiate KYC and document-verification workflows.

- Access customer-approved documents through restricted sessions.

- Manually review documents and record verification findings.

- Issue institution-specific verification attestations through Drunix.

- Request additional documents where institutional policy requires them.

- Run or review credit-risk assessments using authorized financial data.

- View risk estimates, risk bands and the factors contributing to the model's output.

- Maintain histories of document requests, customer approvals, verification decisions and access events.

## Bank A versus other financial institutions

Bank A may perform the initial KYC verification and record its result on Drunix.

When another institution, such as an NBFC, subsequently views the business profile, it can inspect the relevant attestation. If the NBFC's policies require an independent review of the original documents, it can request those documents directly from the business through TrustLedger.

The NBFC does not automatically gain access to Bank A's internal customer database or all documents held by the business.

Previous verification is evidence that a participating institution performed a check. It does not automatically compel another institution to accept that result.

## C. MSME / Business / User Dashboard

This dashboard gives businesses control over their document collection and the institutions that request access.

## Main features

- Register and manage the business profile.

- Upload and organize documents.

- Store documents securely through Nextcloud.

- View document status and verification history.

- See which institution issued a verification attestation and when.

- Receive document requests from banks and NBFCs.

- Review the exact documents requested, the purpose and the requested access period.

- Approve or reject each request.

- Select individual documents for sharing instead of exposing the entire document vault.

- Complete the required OTP and authentication process.

- View active access permissions and past access events.

- Revoke future access where supported.

- Receive notifications when documents are requested, accessed or when an authorization expires.

The business remains in control of whether to authorize a particular disclosure, subject to any separately applicable legal obligations.

## 4. End-to-End Project Workflow

## Phase 1: Business Registration and Document Upload

- 1. The MSME registers on TrustLedger.

- 2. The system creates its business profile and assigns the appropriate user role.

- 3. The business uploads documents through the application.

- 4. The backend transfers the files to Nextcloud using its API.

- 5. PostgreSQL stores the necessary document metadata and Nextcloud file references.

- 6. The backend can calculate a cryptographic fingerprint of each document for integrity verification.

- 7. Drunix records the relevant document-registration information or fingerprint where appropriate, without storing the actual file.

Documents may include business registration certificates, GST-related documents, PAN-related business documents, bank statements and other supporting evidence.

The platform must not assume that every document type is required for every KYC or lending process.

## Phase 2: Bank A Performs KYC

- 1. The business approaches Bank A and initiates a verification request.

- 2. Bank A requests access to the required documents.

- 3. The business reviews the request and approves the selected documents.

- 4. The authorized Bank A representative signs in to the Financial Institution Dashboard.

- 5. The system validates the institution's identity, customer approval and requested permissions.

- 6. The representative completes the required OTP verification to activate the restricted access session.

- 7. Bank A views the approved documents through TrustLedger.

- 8. The authorized officer manually examines the documents and performs the required checks.

- 9. The officer records the findings and verification outcome.

- 10. If verification succeeds, Bank A issues a verification attestation through the platform.

- 11. Drunix records the relevant institution identity, verification type, status, timestamps and document-integrity references.

Important distinction: TrustLedger does not use an LLM to inspect the customer's personal documents in the initial prototype. KYC remains an institution-led verification process, supported by ordinary application validation where appropriate.

## Phase 3: Credit Risk Assessment During Bank A's Workflow

Once the required financial information is available and authorized, the platform can run a separate credit-risk assessment.

- 1. Bank A or the business provides the financial information needed for the assessment under the applicable authorization.

- 2. The backend validates the data and converts it into structured features, such as cash-flow trends, revenue stability, debt obligations and eligible repayment-history indicators.

- 3. The structured features are sent to a separate Python-based ML service.

- 4. The model estimates repayment risk and returns a score or probability, an associated risk band and the model version.

- 5. The dashboard displays the result and its main contributing factors.

- 6. Bank A's authorized officer reviews the assessment and makes the relevant decision under the institution's own policies.

- 7. The detailed assessment remains in protected off-chain storage. Drunix can record a minimal assessment attestation or report reference, including the model version and relevant timestamps.

The risk model is not an identity-verification system. A low-risk score does not mean KYC has passed, and an elevated risk estimate does not establish that a customer is fraudulent.

The credit-risk assessment is decision support, not an automatic substitute for the bank's lending decision.

## Phase 4: Another Institution Checks the Existing Verification

- 1. The MSME approaches an NBFC for a business loan.

- 2. The NBFC signs in through its institutional account.

- 3. The platform retrieves the relevant verification attestation from Drunix.

- 4. The NBFC sees which institution issued the verification, the verification type, current status and relevant timestamps.

- 5. The NBFC decides whether that evidence meets its own requirements.

- 6. If additional checks are needed, it can request particular documents from the business or initiate its own verification.

This process allows verification evidence to be reused where accepted without requiring banks to surrender their internal customer databases.

## Phase 5: Restricted, OTP-Protected Document Sharing

Suppose the NBFC needs to examine the GST certificate and bank statement independently.

- 1. The NBFC creates a document request identifying the required files, purpose and requested access period.

- 2. The MSME receives the request in its dashboard.

- 3. The user reviews the request and approves or rejects individual documents.

- 4. The required customer-approval and OTP checks are completed.

- 5. The backend verifies the institution identity, the request, the user's approval and the scope of permission.

- 6. The system creates an institution-specific restricted session.

- 7. The NBFC authenticates and accesses only the approved documents through the application.

- 8. Important request, approval and access events are recorded.

- 9. Access expires automatically or is revoked when authorization is withdrawn, where supported.

A forwarded link alone must not be sufficient to obtain access. Institution authentication and server-side permission checks are required in addition to OTP verification.

Expiring or revoking access prevents future access through the platform, but cannot guarantee deletion of copies an institution has already downloaded.

## Phase 6: Subsequent Verification and Reuse

The same process can be repeated as the business approaches other financial institutions.

Each institution can inspect relevant verification evidence, request additional documents if necessary and perform its own required checks.

Access remains specific to the institution, the request and the documents authorized by the business.

## 5. Revised AI Component: Credit Risk Only

TrustLedger will not include LLM-based document scrutiny in its initial prototype.

The AI component will focus exclusively on estimating MSME credit risk using permitted structured financial information.

## Model inputs

Depending on data availability, suitability and authorization, potential features include:

- Revenue and cash-flow trends.

- Stability of business income.

- Existing debt obligations.

- Debt-service or repayment indicators.

- Historical repayment outcomes.

- Relevant financial ratios.

The exact feature set will be determined by the dataset and the intended prediction target.

The model will not automatically receive all documents in Nextcloud. It will receive only the necessary structured features supplied by the backend.

## Model output

The initial prototype may return:

- An estimated default probability or numerical risk score.

- A documented risk category.

- The factors that contributed most to the estimate.

- Model version and assessment timestamp.

A higher risk score can be defined to indicate greater estimated repayment risk, provided the scoring convention is documented consistently.

## Recommended implementation

- Python for model development.

- pandas for data preparation.

- scikit-learn and, if justified by evaluation, XGBoost for prediction.

- FastAPI for model inference.

- SHAP or another suitable explanation method for feature-level explanations, if supported by the chosen model.

- PostgreSQL for protected prediction records and model metadata.

- Drunix for minimal verification or assessment attestations.

For the hackathon, the model can be developed using a suitable labelled public dataset or synthetic data. If synthetic data is used, the results must be described as synthetic-data results rather than evidence of real-world lending accuracy.

Historical approval and rejection decisions alone should not be treated as sufficient ground truth for repayment risk. A supervised credit-risk model needs a clearly defined target outcome and appropriate training and test data.

## 6. Document Storage and System Architecture

The platform separates operational information, documents and shared verification records.

## Nextcloud — Actual Document Storage

Nextcloud stores uploaded documents and provides authenticated file operations through its APIs.

The application backend manages document references and access permissions. Nextcloud's storage encryption configuration must be evaluated separately from end-to-end encryption.

## PostgreSQL — Application Database

PostgreSQL stores:

- Business and institution profiles.

- Employee accounts and role assignments.

- Document metadata and storage references.

- Document-request and consent workflow states.

- OTP challenge status and session references.

- Detailed risk-assessment results and model metadata.

- Operational audit records.

Passwords, OTPs, access tokens and other authentication secrets must not be stored as plaintext.

## Drunix — Shared Verification and Authorization Layer

Drunix is a required component of TrustLedger.

Its proposed functions include:

- Recording institution-issued verification attestations.

- Tracking relevant verification status changes.

- Recording document-integrity references.

- Recording consent and authorization decisions.

- Tracking authorization expiry and revocation.

- Maintaining relevant shared audit events.

- Enforcing agreed organization-level transaction policies.

Actual documents, raw financial features, OTPs, passwords, encryption keys and unnecessary personal details remain off-chain.

The backend must check the relevant authorization state before providing a document. A ledger entry alone does not automatically protect a file stored in Nextcloud.

## 7. Role-Based Access Control (RBAC)

All three dashboards use RBAC together with organization-level and resource- level permissions.

| Role                                                                         | Main permissions                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
|                                                                              | Manage institution onboarding, platform configuration and     |
| Platform Super Admin                                                         |                                                               |
|                                                                              | system-level policies.                                        |
| Institution Admin Manage employees, roles and internal institution settings. |                                                               |
|                                                                              | Review customer-authorized documents and conduct assigned     |
| KYC Officer                                                                  |                                                               |
|                                                                              | verification procedures.                                      |
| Compliance / Audit                                                           | Access permitted verification records, compliance details and |
| Officer                                                                      | audit events.                                                 |
|                                                                              | Review permitted financial information and credit-risk        |
| Loan / Credit Officer                                                        |                                                               |
|                                                                              | assessments.                                                  |
|                                                                              | Manage the business profile, upload documents and approve     |
| MSME / Business Owner                                                        |                                                               |
|                                                                              | or reject sharing requests.                                   |
| Authorized Business                                                          | Use only the functions and documents delegated to that        |
| Employee                                                                     | employee.                                                     |

A user's role does not provide unrestricted access to all documents.

Every document request must be checked against the relevant institution, customer, request status, approved files, permission scope and validity period.

## 8. Security and Privacy Principles

- 1. No LLM-based document processing: Raw customer documents are not sent to an LLM in the initial prototype.

- 2. Data minimization: The ML service receives only the necessary authorized structured financial features.

- 3. Least privilege: Users and institutions receive only the permissions needed for their tasks.

- 4. Customer-controlled disclosure: The business explicitly approves the requested documents.

- 5. Institution authentication: OTP or possession of a link alone does not establish that the requester is an authorized financial institution.

- 6. Restricted sessions: Access is bound to the institution and approved documents, with a defined expiry.

- 7. Encryption: Documents are protected in transit and at rest, with an explicit key-management design.

- 8. Document integrity: Cryptographic fingerprints help establish whether a reviewed file matches the registered version.

- 9. Minimal on-chain data: Drunix stores only the information required for shared verification and authorization.

- 10. Auditable activity: Important verification, approval, rejection and access events are recorded.

- 11. Controlled model access: The credit-risk service receives only permitted financial features.

- 12. Human oversight: KYC and lending decisions remain subject to the institution's applicable policies and responsibilities.

These design choices support privacy-conscious processing but do not, by themselves, establish regulatory compliance or production readiness.

## 9. Technology Stack

| Layer                                                                              | Recommended technology                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Frontend                                                                           | Next.js, React, TypeScript                                      |
| UI                                                                                 | Tailwind CSS, shadcn/ui                                         |
| Backend API Node.js, NestJS, TypeScript                                            |                                                                 |
| Application                                                                        |                                                                 |
|                                                                                    | PostgreSQL, Prisma ORM                                          |
| database                                                                           |                                                                 |
| Document storage Nextcloud, WebDAV and OCS Share API                               |                                                                 |
| Blockchain platformNPCI Drunix                                                     |                                                                 |
| Chaincode                                                                          | Go                                                              |
|                                                                                    | Compatible Hyperledger Fabric Gateway client, validated against |
| Blockchain client                                                                  |                                                                 |
|                                                                                    | Drunix                                                          |
| Credit-risk model Python, pandas, scikit-learn; XGBoost if evaluation justifies it |                                                                 |
| ML API                                                                             | FastAPI                                                         |
| Model explanations SHAP, if appropriate for the selected model                     |                                                                 |
| Authentication Server-side sessions, RBAC and OTP                                  |                                                                 |
|                                                                                    | Automated integration tests, k6 and custom Drunix transaction   |
| Testing and metrics                                                                |                                                                 |
|                                                                                    | benchmarking                                                    |
| Development Docker, Docker Compose, Git and GitHub                                 |                                                                 |

## 10. Metrics and Evaluation

All quantitative results must come from actual tests. No unmeasured performance numbers will be presented as achieved results.

## Technical performance

- Drunix transaction throughput in successful committed transactions per second.

- Transaction latency, including median and p95 measurements.

- Document-upload and retrieval latency.

- End-to-end authorization latency.

- API error rate under a defined workload.

- Availability over a defined test period.

- Success rate for document-access authorization tests.

## Security and workflow metrics

- Unauthorized document-access attempts blocked.

- Access attempts correctly rejected after expiry or revocation.

- Successful verification and authorization transactions.

- Integrity-check outcomes for registered documents.

- Completion time for the simulated multi-institution verification flow.

- Reduction in repeated document uploads in the prototype's controlled test scenario.

## Credit-risk model metrics

- ROC-AUC.

- Precision and recall.

- F1 score at a documented threshold.

- Probability calibration.

- Explanation consistency and relevant feature checks.

Model evaluation must use a held-out test set with a clearly defined repayment- risk target. Results from synthetic data must be labelled accordingly.

## Pitch Deck Mapping

Slide 2 — Problem, Solution and Value: Explain repeated verification, customer- controlled document sharing and the intended benefit to MSMEs.

Slide 3 — Integration and Architecture: Show the three dashboards, Nextcloud document storage, the credit-risk service, the backend and the Drunix transaction flow.

Slide 4 — Innovation, Scale, Security, Risk and Impact: Present measured TPS, latency, availability or error rate, access-control results, model metrics and risk mitigations.

Slide 5 — Prototype, Demo and Roadmap: Demonstrate the actual working workflow and provide the public repository and demo links.

The slide's performance and impact figures must reflect measured prototype results or clearly labelled estimates, not invented achievements.

## 11. Implementation Scope

The first version should demonstrate one complete end-to-end journey.

## Core deliverables

- Three dashboards with authentication and RBAC.

- MSME document upload into Nextcloud.

- Bank A's manual KYC workflow.

- Verification attestation recorded on Drunix.

- Cross-institution verification-status lookup.

- Document requests with customer approval and OTP-protected access.

- Institution-specific, document-level access restrictions.

- Expiry and revocation of platform access.

- A Python-based credit-risk inference service.

- Human review of the risk assessment.

- Protected off-chain model results and a minimal Drunix assessment reference, where appropriate.

- Automated integration tests and measured performance results.

## Future extensions

After the core workflow is established, the project could add additional data- source integrations, improved model evaluation, a dispute-resolution process and

a simulated payment adapter linked to the verification and authorization conditions.

These extensions are not prerequisites for the initial working prototype.

## 12. Expected Impact

TrustLedger aims to reduce repetitive verification work for MSMEs and improve the security and transparency of document sharing between financial institutions.

For MSMEs, the platform offers a centralized document-management experience and greater control over document disclosure.

For banks and NBFCs, it offers institution-issued verification evidence, customer- authorized document access and an additional credit-risk assessment signal.

For the shared platform, Drunix provides a verifiable record of verification and authorization events without requiring competing institutions to surrender their internal customer databases.

The magnitude of these benefits will need to be established through measured prototype results and, eventually, evaluation with suitable real-world partners and data.

## 13. Project Positioning

TrustLedger combines five core capabilities:

- 1. Reusable verification attestations issued by participating financial institutions.

- 2. Secure, customer-controlled document sharing.

- 3. OTP-protected, institution-authenticated, time-limited access sessions.

- 4. Explainable ML-based credit-risk assessment using authorized structured financial information.

- 5. A shared, auditable verification and authorization layer powered by NPCI Drunix.

The initial prototype deliberately excludes LLM-based document scrutiny to minimize unnecessary processing of sensitive personal documents.

Core principle: Verify through the institution. Share only with consent. Assess risk using authorized financial evidence. Record shared authorization and verification through Drunix.

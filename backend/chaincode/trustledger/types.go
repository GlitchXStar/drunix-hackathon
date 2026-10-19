package main

// Institution types and statuses
const (
	InstitutionTypeBank     = "BANK"
	InstitutionTypeNBFC     = "NBFC"
	InstitutionTypePlatform = "PLATFORM"

	InstitutionStatusActive    = "ACTIVE"
	InstitutionStatusSuspended = "SUSPENDED"

	PlatformOrgMSP = "PlatformOrgMSP"
)

// Attestation statuses
const (
	AttestationStatusValid     = "VALID"
	AttestationStatusSuspended = "SUSPENDED"
	AttestationStatusRevoked   = "REVOKED"
	AttestationStatusExpired   = "EXPIRED"
)

// Consent statuses and scope types
const (
	ConsentStatusActive  = "ACTIVE"
	ConsentStatusRevoked = "REVOKED"
	ConsentStatusExpired = "EXPIRED"

	ScopeTypeProfile   = "PROFILE"
	ScopeTypeDocuments = "DOCUMENTS"
	ScopeTypeFeatures  = "FEATURES"
)

// AccessEvent action types
const (
	ActionSessionOpened      = "SESSION_OPENED"
	ActionDocumentViewed     = "DOCUMENT_VIEWED"
	ActionDocumentDownloaded = "DOCUMENT_DOWNLOADED"
	ActionAccessDenied       = "ACCESS_DENIED"
	ActionSessionClosed      = "SESSION_CLOSED"
)

// Risk Bands
const (
	RiskBandLow    = "LOW"
	RiskBandMedium = "MEDIUM"
	RiskBandHigh   = "HIGH"
)

// CheckAccess Reason Codes
const (
	ReasonAccessAllowed       = "ACCESS_ALLOWED"
	ReasonConsentNotFound     = "CONSENT_NOT_FOUND"
	ReasonConsentExpired      = "CONSENT_EXPIRED"
	ReasonConsentRevoked      = "CONSENT_REVOKED"
	ReasonConsentNotActive    = "CONSENT_NOT_ACTIVE"
	ReasonInstitutionMismatch = "INSTITUTION_MISMATCH"
	ReasonInstitutionSuspended = "INSTITUTION_SUSPENDED"
	ReasonScopeMismatch       = "SCOPE_MISMATCH"
	ReasonDocNotInScope       = "DOC_NOT_IN_SCOPE"
)

// Composite Key Object Types
const (
	KeyTypeInstitution         = "Institution"
	KeyTypeInstitutionByMSP    = "InstitutionByMSP"
	KeyTypeBusiness            = "Business"
	KeyTypeDocument            = "Document"
	KeyTypeAttestation         = "Attestation"
	KeyTypeBusinessAttestation = "BusinessAttestation"
	KeyTypeConsent             = "Consent"
	KeyTypeAccessEvent         = "AccessEvent"
	KeyTypeAssessmentRef       = "AssessmentRef"
)

// Institution record on ledger
type Institution struct {
	InstID string `json:"instId"`
	MSPID  string `json:"mspId"`
	Type   string `json:"type"`   // BANK, NBFC, PLATFORM
	Status string `json:"status"` // ACTIVE, SUSPENDED
}

// Business record on ledger
type Business struct {
	BusinessRef string `json:"businessRef"`
	CreatedAt   string `json:"createdAt"`
}

// Document record on ledger
type Document struct {
	DocRef       string `json:"docRef"`
	BusinessRef  string `json:"businessRef"`
	DocType      string `json:"docType"`
	ContentHash  string `json:"contentHash"`
	Version      int    `json:"version"`
	RegisteredAt string `json:"registeredAt"`
}

// Attestation record on ledger
type Attestation struct {
	AttID           string   `json:"attId"`
	BusinessRef     string   `json:"businessRef"`
	IssuerInstID    string   `json:"issuerInstId"`
	Type            string   `json:"type"`
	Status          string   `json:"status"` // VALID, SUSPENDED, REVOKED, EXPIRED
	DocHashSnapshot []string `json:"docHashSnapshot"`
	IssuedAt        string   `json:"issuedAt"`
	ValidUntil      string   `json:"validUntil"`
	ReasonCode      string   `json:"reasonCode,omitempty"`
}

// Consent record on ledger
type Consent struct {
	ConsentID             string   `json:"consentId"`
	BusinessRef           string   `json:"businessRef"`
	InstitutionID         string   `json:"institutionId"`
	ScopeType             string   `json:"scopeType"` // PROFILE, DOCUMENTS, FEATURES
	DocRefs               []string `json:"docRefs"`
	PurposeCode           string   `json:"purposeCode"`
	ExpiresAt             string   `json:"expiresAt"`
	Status                string   `json:"status"` // ACTIVE, REVOKED, EXPIRED
	ApprovalEvidenceHash  string   `json:"approvalEvidenceHash"`
}

// AccessEvent record on ledger
type AccessEvent struct {
	EventID       string `json:"eventId"`
	ConsentID     string `json:"consentId"`
	InstitutionID string `json:"institutionId"`
	DocRef        string `json:"docRef"`
	Action        string `json:"action"` // SESSION_OPENED, DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, ACCESS_DENIED, SESSION_CLOSED
	At            string `json:"at"`
}

// AssessmentRef record on ledger
type AssessmentRef struct {
	AssessmentID  string `json:"assessmentId"`
	BusinessRef   string `json:"businessRef"`
	InstitutionID string `json:"institutionId"`
	ModelVersion  string `json:"modelVersion"`
	RiskBand      string `json:"riskBand"`
	ReportHash    string `json:"reportHash"`
	At            string `json:"at"`
}

// CheckAccessResult output structure
type CheckAccessResult struct {
	Allowed    bool   `json:"allowed"`
	ReasonCode string `json:"reasonCode"`
}

// HistoryRecord represents a historical version of a record
type HistoryRecord struct {
	TxID      string `json:"txId"`
	Value     string `json:"value"`
	Timestamp string `json:"timestamp"`
	IsDelete  bool   `json:"isDelete"`
}

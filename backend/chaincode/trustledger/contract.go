package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// SmartContract provides functions for managing TrustLedger records on Drunix
type SmartContract struct {
	contractapi.Contract
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func isValidSHA256Hex(s string) bool {
	if len(s) != 64 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func (s *SmartContract) getCallerMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	clientIdentity, err := ctx.GetClientIdentity()
	if err != nil {
		return "", fmt.Errorf("failed to retrieve client identity: %w", err)
	}
	mspID, err := clientIdentity.GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to extract caller MSP ID: %w", err)
	}
	return mspID, nil
}

func (s *SmartContract) getTxTime(ctx contractapi.TransactionContextInterface) (time.Time, error) {
	txTime, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to retrieve transaction timestamp: %w", err)
	}
	return time.Unix(txTime.GetSeconds(), int64(txTime.GetNanos())).UTC(), nil
}

func (s *SmartContract) requirePlatformOrg(ctx contractapi.TransactionContextInterface) error {
	callerMSP, err := s.getCallerMSP(ctx)
	if err != nil {
		return err
	}
	if callerMSP != PlatformOrgMSP {
		return fmt.Errorf("unauthorized: caller %s is not PlatformOrg", callerMSP)
	}
	return nil
}

func (s *SmartContract) requireActiveInstitution(ctx contractapi.TransactionContextInterface) (string, error) {
	callerMSP, err := s.getCallerMSP(ctx)
	if err != nil {
		return "", err
	}

	// PlatformOrg is always authorized for administrative tasks
	if callerMSP == PlatformOrgMSP {
		return callerMSP, nil
	}

	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitutionByMSP, []string{callerMSP})
	if err != nil {
		return "", err
	}

	instIDBytes, err := ctx.GetStub().GetState(instKey)
	if err != nil {
		return "", fmt.Errorf("failed to read institution index: %w", err)
	}
	if instIDBytes == nil {
		return "", fmt.Errorf("unauthorized: institution with MSP ID %s is not registered", callerMSP)
	}

	instRecordKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{string(instIDBytes)})
	if err != nil {
		return "", err
	}

	instBytes, err := ctx.GetStub().GetState(instRecordKey)
	if err != nil || instBytes == nil {
		return "", fmt.Errorf("failed to read institution record for %s", string(instIDBytes))
	}

	var inst Institution
	if err := json.Unmarshal(instBytes, &inst); err != nil {
		return "", fmt.Errorf("failed to parse institution record: %w", err)
	}

	if inst.Status != InstitutionStatusActive {
		return "", fmt.Errorf("forbidden: institution %s is %s", inst.InstID, inst.Status)
	}

	return callerMSP, nil
}

// ---------------------------------------------------------------------------
// 1. Institution Management
// ---------------------------------------------------------------------------

func (s *SmartContract) RegisterInstitution(ctx contractapi.TransactionContextInterface, instId string, mspId string, instType string) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if strings.TrimSpace(instId) == "" || strings.TrimSpace(mspId) == "" {
		return fmt.Errorf("instId and mspId must not be empty")
	}

	if instType != InstitutionTypeBank && instType != InstitutionTypeNBFC && instType != InstitutionTypePlatform {
		return fmt.Errorf("invalid institution type: %s (must be BANK, NBFC, or PLATFORM)", instType)
	}

	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{instId})
	if err != nil {
		return err
	}

	existing, err := ctx.GetStub().GetState(instKey)
	if err != nil {
		return fmt.Errorf("failed checking existing institution: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("institution with ID %s already exists", instId)
	}

	inst := Institution{
		InstID: instId,
		MSPID:  mspId,
		Type:   instType,
		Status: InstitutionStatusActive,
	}

	instBytes, err := json.Marshal(inst)
	if err != nil {
		return err
	}

	if err := ctx.GetStub().PutState(instKey, instBytes); err != nil {
		return fmt.Errorf("failed to store institution: %w", err)
	}

	// Secondary index by MSP ID
	mspIndexKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitutionByMSP, []string{mspId})
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(mspIndexKey, []byte(instId))
}

func (s *SmartContract) SetInstitutionStatus(ctx contractapi.TransactionContextInterface, instId string, status string) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if status != InstitutionStatusActive && status != InstitutionStatusSuspended {
		return fmt.Errorf("invalid status: %s (must be ACTIVE or SUSPENDED)", status)
	}

	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{instId})
	if err != nil {
		return err
	}

	instBytes, err := ctx.GetStub().GetState(instKey)
	if err != nil {
		return err
	}
	if instBytes == nil {
		return fmt.Errorf("institution with ID %s not found", instId)
	}

	var inst Institution
	if err := json.Unmarshal(instBytes, &inst); err != nil {
		return err
	}

	inst.Status = status
	updatedBytes, err := json.Marshal(inst)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(instKey, updatedBytes)
}

// ---------------------------------------------------------------------------
// 2. Business Registration
// ---------------------------------------------------------------------------

func (s *SmartContract) RegisterBusiness(ctx contractapi.TransactionContextInterface, businessRef string) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if strings.TrimSpace(businessRef) == "" {
		return fmt.Errorf("businessRef must not be empty")
	}

	bizKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusiness, []string{businessRef})
	if err != nil {
		return err
	}

	existing, err := ctx.GetStub().GetState(bizKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("business %s already exists", businessRef)
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	biz := Business{
		BusinessRef: businessRef,
		CreatedAt:   now.Format(time.RFC3339),
	}

	bizBytes, err := json.Marshal(biz)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(bizKey, bizBytes)
}

// ---------------------------------------------------------------------------
// 3. Document Registration (docRef, businessRef, docType, contentHash)
// ---------------------------------------------------------------------------

func (s *SmartContract) RegisterDocument(ctx contractapi.TransactionContextInterface, docRef string, businessRef string, docType string, contentHash string) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if strings.TrimSpace(docRef) == "" || strings.TrimSpace(businessRef) == "" || strings.TrimSpace(docType) == "" {
		return fmt.Errorf("docRef, businessRef, and docType must not be empty")
	}

	if !isValidSHA256Hex(contentHash) {
		return fmt.Errorf("invalid contentHash: must be a 64-character hex SHA-256 string")
	}

	// Verify business exists
	bizKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusiness, []string{businessRef})
	if err != nil {
		return err
	}
	bizBytes, err := ctx.GetStub().GetState(bizKey)
	if err != nil || bizBytes == nil {
		return fmt.Errorf("business %s does not exist", businessRef)
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	docKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeDocument, []string{docRef})
	if err != nil {
		return err
	}

	existingBytes, err := ctx.GetStub().GetState(docKey)
	if err != nil {
		return err
	}

	version := 1
	if existingBytes != nil {
		var existing Document
		if err := json.Unmarshal(existingBytes, &existing); err != nil {
			return fmt.Errorf("failed to parse existing document: %w", err)
		}
		if existing.BusinessRef != businessRef {
			return fmt.Errorf("businessRef mismatch: document %s belongs to %s, not %s", docRef, existing.BusinessRef, businessRef)
		}
		if existing.ContentHash == contentHash {
			return fmt.Errorf("document %s already registered with identical contentHash (duplicate registration)", docRef)
		}
		// Replacing document creates version n+1 (SPEC.md W1)
		version = existing.Version + 1
	}

	doc := Document{
		DocRef:       docRef,
		BusinessRef:  businessRef,
		DocType:      docType,
		ContentHash:  contentHash,
		Version:      version,
		RegisteredAt: now.Format(time.RFC3339),
	}

	docBytes, err := json.Marshal(doc)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(docKey, docBytes)
}

// ---------------------------------------------------------------------------
// 4. Consent Management
// ---------------------------------------------------------------------------

func (s *SmartContract) CreateConsent(
	ctx contractapi.TransactionContextInterface,
	consentId string,
	businessRef string,
	institutionId string,
	scopeType string,
	docRefsJSON string,
	purposeCode string,
	expiresAt string,
	approvalEvidenceHash string,
) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if strings.TrimSpace(consentId) == "" || strings.TrimSpace(businessRef) == "" || strings.TrimSpace(institutionId) == "" {
		return fmt.Errorf("consentId, businessRef, and institutionId must not be empty")
	}

	if scopeType != ScopeTypeProfile && scopeType != ScopeTypeDocuments && scopeType != ScopeTypeFeatures {
		return fmt.Errorf("invalid scopeType: %s (must be PROFILE, DOCUMENTS, or FEATURES)", scopeType)
	}

	if !isValidSHA256Hex(approvalEvidenceHash) {
		return fmt.Errorf("invalid approvalEvidenceHash: must be a 64-character hex SHA-256 string")
	}

	// Check duplicate consent
	consentKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeConsent, []string{consentId})
	if err != nil {
		return err
	}
	existing, err := ctx.GetStub().GetState(consentKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("consent with ID %s already exists", consentId)
	}

	// Verify business exists
	bizKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusiness, []string{businessRef})
	if err != nil {
		return err
	}
	bizBytes, err := ctx.GetStub().GetState(bizKey)
	if err != nil || bizBytes == nil {
		return fmt.Errorf("business %s does not exist", businessRef)
	}

	// Verify institution exists and is active (support lookup by instId or mspId)
	var inst Institution
	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{institutionId})
	if err != nil {
		return err
	}
	instBytes, err := ctx.GetStub().GetState(instKey)
	if err == nil && instBytes != nil {
		if err := json.Unmarshal(instBytes, &inst); err != nil {
			return err
		}
	} else {
		mspKey, _ := ctx.GetStub().CreateCompositeKey(KeyTypeInstitutionByMSP, []string{institutionId})
		instIdBytes, _ := ctx.GetStub().GetState(mspKey)
		if instIdBytes != nil {
			instKey2, _ := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{string(instIdBytes)})
			instBytes2, _ := ctx.GetStub().GetState(instKey2)
			if instBytes2 != nil {
				_ = json.Unmarshal(instBytes2, &inst)
			}
		}
	}

	if inst.InstID == "" && inst.MSPID == "" {
		return fmt.Errorf("institution %s does not exist", institutionId)
	}
	if inst.Status != InstitutionStatusActive {
		return fmt.Errorf("cannot grant consent to suspended institution %s", institutionId)
	}

	// Parse and validate expiration
	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	expTime, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return fmt.Errorf("invalid expiresAt format, expected RFC3339: %w", err)
	}

	if !expTime.After(now) {
		return fmt.Errorf("consent expiry MUST be in the future")
	}

	maxExpiry := now.Add(30 * 24 * time.Hour)
	if expTime.After(maxExpiry) {
		return fmt.Errorf("consent expiry exceeds 30-day maximum limit")
	}

	var docRefs []string
	if strings.TrimSpace(docRefsJSON) != "" && docRefsJSON != "[]" {
		if err := json.Unmarshal([]byte(docRefsJSON), &docRefs); err != nil {
			return fmt.Errorf("failed to parse docRefsJSON: %w", err)
		}
	}

	if scopeType == ScopeTypeDocuments {
		if len(docRefs) == 0 {
			return fmt.Errorf("docRefs must not be empty for DOCUMENTS scope")
		}
		// Verify every approved document exists on ledger and belongs to this business
		for _, ref := range docRefs {
			dKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeDocument, []string{ref})
			if err != nil {
				return err
			}
			dBytes, err := ctx.GetStub().GetState(dKey)
			if err != nil || dBytes == nil {
				return fmt.Errorf("document %s does not exist on ledger", ref)
			}
			var d Document
			if err := json.Unmarshal(dBytes, &d); err == nil {
				if d.BusinessRef != businessRef {
					return fmt.Errorf("document %s belongs to business %s, not %s", ref, d.BusinessRef, businessRef)
				}
			}
		}
	}

	consent := Consent{
		ConsentID:            consentId,
		BusinessRef:          businessRef,
		InstitutionID:        institutionId,
		ScopeType:            scopeType,
		DocRefs:              docRefs,
		PurposeCode:          purposeCode,
		ExpiresAt:            expiresAt,
		Status:               ConsentStatusActive,
		ApprovalEvidenceHash: approvalEvidenceHash,
	}

	consentBytes, err := json.Marshal(consent)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(consentKey, consentBytes)
}

func (s *SmartContract) RevokeConsent(ctx contractapi.TransactionContextInterface, consentId string) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	consentKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeConsent, []string{consentId})
	if err != nil {
		return err
	}

	consentBytes, err := ctx.GetStub().GetState(consentKey)
	if err != nil {
		return err
	}
	if consentBytes == nil {
		return fmt.Errorf("consent %s not found", consentId)
	}

	var consent Consent
	if err := json.Unmarshal(consentBytes, &consent); err != nil {
		return err
	}

	if consent.Status == ConsentStatusRevoked {
		return fmt.Errorf("consent %s is already revoked", consentId)
	}

	consent.Status = ConsentStatusRevoked
	updatedBytes, err := json.Marshal(consent)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(consentKey, updatedBytes)
}

// ---------------------------------------------------------------------------
// 5. Attestation Management
// ---------------------------------------------------------------------------

func (s *SmartContract) IssueAttestation(
	ctx contractapi.TransactionContextInterface,
	attId string,
	businessRef string,
	attType string,
	docHashSnapshotJSON string,
	validUntil string,
) error {
	callerMSP, err := s.requireActiveInstitution(ctx)
	if err != nil {
		return err
	}

	if strings.TrimSpace(attId) == "" || strings.TrimSpace(businessRef) == "" {
		return fmt.Errorf("attId and businessRef must not be empty")
	}

	attKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeAttestation, []string{attId})
	if err != nil {
		return err
	}

	existing, err := ctx.GetStub().GetState(attKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("attestation with ID %s already exists", attId)
	}

	bizKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusiness, []string{businessRef})
	if err != nil {
		return err
	}
	bizBytes, err := ctx.GetStub().GetState(bizKey)
	if err != nil || bizBytes == nil {
		return fmt.Errorf("business %s does not exist", businessRef)
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	valTime, err := time.Parse(time.RFC3339, validUntil)
	if err != nil {
		return fmt.Errorf("invalid validUntil format, expected RFC3339: %w", err)
	}
	if !valTime.After(now) {
		return fmt.Errorf("validUntil must be in the future")
	}

	// Maximum 24-month validity limit (§8.5)
	maxValTime := now.AddDate(0, 24, 0)
	if valTime.After(maxValTime) {
		return fmt.Errorf("validUntil exceeds 24-month maximum attestation validity limit")
	}

	var snapshots []string
	if strings.TrimSpace(docHashSnapshotJSON) != "" && docHashSnapshotJSON != "[]" {
		if err := json.Unmarshal([]byte(docHashSnapshotJSON), &snapshots); err != nil {
			return fmt.Errorf("failed to parse docHashSnapshotJSON: %w", err)
		}
	}

	for _, snap := range snapshots {
		if !isValidSHA256Hex(snap) {
			return fmt.Errorf("invalid docHashSnapshot entry %s: must be a 64-character hex SHA-256 string", snap)
		}
	}

	att := Attestation{
		AttID:           attId,
		BusinessRef:     businessRef,
		IssuerInstID:    callerMSP, // Issuer derived from caller MSP, never from client argument
		Type:            attType,
		Status:          AttestationStatusValid,
		DocHashSnapshot: snapshots,
		IssuedAt:        now.Format(time.RFC3339),
		ValidUntil:      validUntil,
	}

	attBytes, err := json.Marshal(att)
	if err != nil {
		return err
	}

	if err := ctx.GetStub().PutState(attKey, attBytes); err != nil {
		return err
	}

	// Index by businessRef for cross-institution lookup
	bizAttKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusinessAttestation, []string{businessRef, attId})
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(bizAttKey, []byte(attId))
}

func (s *SmartContract) UpdateAttestationStatus(ctx contractapi.TransactionContextInterface, attId string, newStatus string, reasonCode string) error {
	callerMSP, err := s.requireActiveInstitution(ctx)
	if err != nil {
		return err
	}

	attKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeAttestation, []string{attId})
	if err != nil {
		return err
	}

	attBytes, err := ctx.GetStub().GetState(attKey)
	if err != nil {
		return err
	}
	if attBytes == nil {
		return fmt.Errorf("attestation with ID %s not found", attId)
	}

	var att Attestation
	if err := json.Unmarshal(attBytes, &att); err != nil {
		return err
	}

	// Only issuing institution may suspend or revoke its own attestation
	if att.IssuerInstID != callerMSP {
		return fmt.Errorf("unauthorized: caller %s did not issue attestation %s", callerMSP, attId)
	}

	// Lifecycle rule (D-9): VALID -> SUSPENDED or REVOKED; SUSPENDED -> REVOKED. No backwards transitions.
	if att.Status == AttestationStatusRevoked {
		return fmt.Errorf("invalid transition: attestation %s is already REVOKED (terminal state)", attId)
	}

	if att.Status == AttestationStatusSuspended && newStatus == AttestationStatusValid {
		return fmt.Errorf("invalid transition (D-9): reinstatement not permitted; issue a new attestation instead")
	}

	if newStatus != AttestationStatusSuspended && newStatus != AttestationStatusRevoked {
		return fmt.Errorf("invalid new status: %s (must be SUSPENDED or REVOKED)", newStatus)
	}

	if att.Status == newStatus {
		return fmt.Errorf("attestation %s is already %s", attId, newStatus)
	}

	now, err := s.getTxTime(ctx)
	if err == nil {
		valTime, err := time.Parse(time.RFC3339, att.ValidUntil)
		if err == nil && !valTime.After(now) {
			return fmt.Errorf("cannot update expired attestation %s", attId)
		}
	}

	att.Status = newStatus
	att.ReasonCode = reasonCode
	updatedBytes, err := json.Marshal(att)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(attKey, updatedBytes)
}

func (s *SmartContract) GetAttestations(ctx contractapi.TransactionContextInterface, businessRef string, consentId string) ([]*Attestation, error) {
	callerMSP, err := s.requireActiveInstitution(ctx)
	if err != nil {
		return nil, err
	}

	// Validate consent: requires ACTIVE PROFILE consent for caller
	consentKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeConsent, []string{consentId})
	if err != nil {
		return nil, err
	}
	consentBytes, err := ctx.GetStub().GetState(consentKey)
	if err != nil || consentBytes == nil {
		return nil, fmt.Errorf("valid PROFILE consent required; consent %s not found", consentId)
	}

	var consent Consent
	if err := json.Unmarshal(consentBytes, &consent); err != nil {
		return nil, err
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return nil, err
	}

	expTime, err := time.Parse(time.RFC3339, consent.ExpiresAt)
	if err != nil || !expTime.After(now) {
		return nil, fmt.Errorf("consent %s has expired", consentId)
	}

	if consent.Status != ConsentStatusActive {
		return nil, fmt.Errorf("consent %s is %s", consentId, consent.Status)
	}

	if consent.BusinessRef != businessRef {
		return nil, fmt.Errorf("consent %s does not match business %s", consentId, businessRef)
	}

	if consent.ScopeType != ScopeTypeProfile {
		return nil, fmt.Errorf("consent %s scope is %s, expected PROFILE", consentId, consent.ScopeType)
	}

	// Verify consent belongs to caller institution
	callerInstKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitutionByMSP, []string{callerMSP})
	if err != nil {
		return nil, err
	}
	callerInstIDBytes, err := ctx.GetStub().GetState(callerInstKey)
	var callerInstID string
	if callerInstIDBytes != nil {
		callerInstID = string(callerInstIDBytes)
	}

	if consent.InstitutionID != callerMSP && (callerInstID == "" || consent.InstitutionID != callerInstID) {
		return nil, fmt.Errorf("unauthorized: consent %s belongs to institution %s, caller is %s", consentId, consent.InstitutionID, callerMSP)
	}

	// Retrieve attestations matching businessRef
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyTypeBusinessAttestation, []string{businessRef})
	if err != nil {
		return nil, fmt.Errorf("failed retrieving attestations iterator: %w", err)
	}
	defer iterator.Close()

	var results []*Attestation
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		attID := string(queryResponse.Value)
		attKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeAttestation, []string{attID})
		if err != nil {
			continue
		}
		attBytes, err := ctx.GetStub().GetState(attKey)
		if err != nil || attBytes == nil {
			continue
		}

		var att Attestation
		if err := json.Unmarshal(attBytes, &att); err == nil {
			// Dynamically reflect expired status
			if att.Status == AttestationStatusValid {
				valTime, err := time.Parse(time.RFC3339, att.ValidUntil)
				if err == nil && !valTime.After(now) {
					att.Status = AttestationStatusExpired
				}
			}
			results = append(results, &att)
		}
	}

	return results, nil
}

// ---------------------------------------------------------------------------
// 6. Access Verification (CheckAccess)
// ---------------------------------------------------------------------------

func (s *SmartContract) CheckAccess(
	ctx contractapi.TransactionContextInterface,
	consentId string,
	institutionId string,
	scopeType string,
	docRef string,
) (*CheckAccessResult, error) {
	consentKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeConsent, []string{consentId})
	if err != nil {
		return nil, err
	}

	consentBytes, err := ctx.GetStub().GetState(consentKey)
	if err != nil || consentBytes == nil {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonConsentNotFound}, nil
	}

	var consent Consent
	if err := json.Unmarshal(consentBytes, &consent); err != nil {
		return nil, err
	}

	// Resolve target institution by instId or mspId
	var targetInst *Institution
	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{institutionId})
	if err == nil {
		instBytes, _ := ctx.GetStub().GetState(instKey)
		if instBytes != nil {
			var inst Institution
			if err := json.Unmarshal(instBytes, &inst); err == nil {
				targetInst = &inst
			}
		}
	}
	if targetInst == nil {
		mspKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitutionByMSP, []string{institutionId})
		if err == nil {
			idBytes, _ := ctx.GetStub().GetState(mspKey)
			if idBytes != nil {
				instKey2, _ := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{string(idBytes)})
				instBytes2, _ := ctx.GetStub().GetState(instKey2)
				if instBytes2 != nil {
					var inst Institution
					if err := json.Unmarshal(instBytes2, &inst); err == nil {
						targetInst = &inst
					}
				}
			}
		}
	}

	if targetInst != nil && targetInst.Status == InstitutionStatusSuspended {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonInstitutionSuspended}, nil
	}

	// Check institution matches consent
	matches := consent.InstitutionID == institutionId
	if !matches && targetInst != nil {
		matches = (consent.InstitutionID == targetInst.InstID || consent.InstitutionID == targetInst.MSPID)
	}
	if !matches {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonInstitutionMismatch}, nil
	}

	// Check consent revoked
	if consent.Status == ConsentStatusRevoked {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonConsentRevoked}, nil
	}

	// Check consent expired
	now, err := s.getTxTime(ctx)
	if err != nil {
		return nil, err
	}
	expTime, err := time.Parse(time.RFC3339, consent.ExpiresAt)
	if err == nil && !expTime.After(now) {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonConsentExpired}, nil
	}

	// Check consent active
	if consent.Status != ConsentStatusActive {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonConsentNotActive}, nil
	}

	// Check scope matches
	if consent.ScopeType != scopeType {
		return &CheckAccessResult{Allowed: false, ReasonCode: ReasonScopeMismatch}, nil
	}

	// If document scope, check docRef in approved docRefs
	if scopeType == ScopeTypeDocuments {
		if strings.TrimSpace(docRef) == "" {
			return &CheckAccessResult{Allowed: false, ReasonCode: ReasonDocNotInScope}, nil
		}
		found := false
		for _, ref := range consent.DocRefs {
			if ref == docRef {
				found = true
				break
			}
		}
		if !found {
			return &CheckAccessResult{Allowed: false, ReasonCode: ReasonDocNotInScope}, nil
		}
	}

	return &CheckAccessResult{Allowed: true, ReasonCode: ReasonAccessAllowed}, nil
}

// ---------------------------------------------------------------------------
// 7. Access Event Audit Recording
// ---------------------------------------------------------------------------

func (s *SmartContract) RecordAccessEvent(
	ctx contractapi.TransactionContextInterface,
	eventId string,
	consentId string,
	institutionId string,
	docRef string,
	action string,
) error {
	if err := s.requirePlatformOrg(ctx); err != nil {
		return err
	}

	if strings.TrimSpace(eventId) == "" || strings.TrimSpace(consentId) == "" || strings.TrimSpace(institutionId) == "" {
		return fmt.Errorf("eventId, consentId, and institutionId must not be empty")
	}

	if action != ActionSessionOpened && action != ActionDocumentViewed &&
		action != ActionDocumentDownloaded && action != ActionAccessDenied && action != ActionSessionClosed {
		return fmt.Errorf("invalid action: %s", action)
	}

	// Verify consent exists on ledger
	consentKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeConsent, []string{consentId})
	if err != nil {
		return err
	}
	consentBytes, err := ctx.GetStub().GetState(consentKey)
	if err != nil || consentBytes == nil {
		return fmt.Errorf("consent %s does not exist on ledger", consentId)
	}

	eventKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeAccessEvent, []string{eventId})
	if err != nil {
		return err
	}

	existing, err := ctx.GetStub().GetState(eventKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("access event with ID %s already exists", eventId)
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	evt := AccessEvent{
		EventID:       eventId,
		ConsentID:     consentId,
		InstitutionID: institutionId,
		DocRef:        docRef,
		Action:        action,
		At:            now.Format(time.RFC3339),
	}

	evtBytes, err := json.Marshal(evt)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(eventKey, evtBytes)
}

// ---------------------------------------------------------------------------
// 8. Risk Assessment Reference
// ---------------------------------------------------------------------------

func (s *SmartContract) RecordAssessment(
	ctx contractapi.TransactionContextInterface,
	assessmentId string,
	businessRef string,
	modelVersion string,
	riskBand string,
	reportHash string,
) error {
	callerMSP, err := s.requireActiveInstitution(ctx)
	if err != nil {
		return err
	}

	if strings.TrimSpace(assessmentId) == "" || strings.TrimSpace(businessRef) == "" {
		return fmt.Errorf("assessmentId and businessRef must not be empty")
	}

	if !isValidSHA256Hex(reportHash) {
		return fmt.Errorf("invalid reportHash: must be a 64-character hex SHA-256 string")
	}

	if riskBand != RiskBandLow && riskBand != RiskBandMedium && riskBand != RiskBandHigh {
		return fmt.Errorf("invalid riskBand: %s (must be LOW, MEDIUM, or HIGH)", riskBand)
	}

	// Verify business exists
	bizKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeBusiness, []string{businessRef})
	if err != nil {
		return err
	}
	bizBytes, err := ctx.GetStub().GetState(bizKey)
	if err != nil || bizBytes == nil {
		return fmt.Errorf("business %s does not exist", businessRef)
	}

	assKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeAssessmentRef, []string{assessmentId})
	if err != nil {
		return err
	}

	existing, err := ctx.GetStub().GetState(assKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("assessment with ID %s already exists", assessmentId)
	}

	now, err := s.getTxTime(ctx)
	if err != nil {
		return err
	}

	assessment := AssessmentRef{
		AssessmentID:  assessmentId,
		BusinessRef:   businessRef,
		InstitutionID: callerMSP,
		ModelVersion:  modelVersion,
		RiskBand:      riskBand,
		ReportHash:    reportHash,
		At:            now.Format(time.RFC3339),
	}

	assBytes, err := json.Marshal(assessment)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(assKey, assBytes)
}

// ---------------------------------------------------------------------------
// 9. Ledger History Query
// ---------------------------------------------------------------------------

func (s *SmartContract) GetHistory(ctx contractapi.TransactionContextInterface, compositeKey string) ([]HistoryRecord, error) {
	if _, err := s.requireActiveInstitution(ctx); err != nil {
		return nil, err
	}

	if strings.TrimSpace(compositeKey) == "" {
		return nil, fmt.Errorf("compositeKey must not be empty")
	}

	iterator, err := ctx.GetStub().GetHistoryForKey(compositeKey)
	if err != nil {
		return nil, fmt.Errorf("failed retrieving history for key %s: %w", compositeKey, err)
	}
	defer iterator.Close()

	var records []HistoryRecord
	for iterator.HasNext() {
		mod, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		timestampStr := ""
		if mod.Timestamp != nil {
			timestampStr = time.Unix(mod.Timestamp.Seconds, int64(mod.Timestamp.Nanos)).UTC().Format(time.RFC3339)
		}

		records = append(records, HistoryRecord{
			TxID:      mod.TxId,
			Value:     string(mod.Value),
			Timestamp: timestampStr,
			IsDelete:  mod.IsDelete,
		})
	}

	return records, nil
}

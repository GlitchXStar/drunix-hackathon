package main

import (
	"crypto/x509"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-protos-go-apiv2/ledger/queryresult"
	"github.com/hyperledger/fabric-protos-go-apiv2/peer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ---------------------------------------------------------------------------
// Mock Implementations for Unit Testing
// ---------------------------------------------------------------------------

type mockClientIdentity struct {
	mspID string
}

func (m *mockClientIdentity) GetID() (string, error) {
	return "mock-cert-id", nil
}

func (m *mockClientIdentity) GetMSPID() (string, error) {
	return m.mspID, nil
}

func (m *mockClientIdentity) GetAttributeValue(attrName string) (value string, found bool, err error) {
	return "", false, nil
}

func (m *mockClientIdentity) AssertAttributeValue(attrName, attrValue string) error {
	return nil
}

func (m *mockClientIdentity) GetX509Certificate() (*x509.Certificate, error) {
	return nil, nil
}

type mockStateQueryIterator struct {
	items []*queryresult.KV
	index int
}

func (it *mockStateQueryIterator) HasNext() bool {
	return it.index < len(it.items)
}

func (it *mockStateQueryIterator) Next() (*queryresult.KV, error) {
	if !it.HasNext() {
		return nil, nil
	}
	item := it.items[it.index]
	it.index++
	return item, nil
}

func (it *mockStateQueryIterator) Close() error {
	return nil
}

type mockHistoryQueryIterator struct {
	records []HistoryRecord
	index   int
}

func (it *mockHistoryQueryIterator) HasNext() bool {
	return it.index < len(it.records)
}

func (it *mockHistoryQueryIterator) Next() (*queryresult.KeyModification, error) {
	if !it.HasNext() {
		return nil, nil
	}
	r := it.records[it.index]
	it.index++
	return &queryresult.KeyModification{
		TxId:      r.TxID,
		Value:     []byte(r.Value),
		IsDelete:  r.IsDelete,
		Timestamp: timestamppb.Now(),
	}, nil
}

func (it *mockHistoryQueryIterator) Close() error {
	return nil
}

type mockChaincodeStub struct {
	state       map[string][]byte
	txTimestamp *timestamppb.Timestamp
	history     map[string][]HistoryRecord
}

func newMockStub(now time.Time) *mockChaincodeStub {
	return &mockChaincodeStub{
		state:       make(map[string][]byte),
		txTimestamp: timestamppb.New(now),
		history:     make(map[string][]HistoryRecord),
	}
}

func (m *mockChaincodeStub) GetState(key string) ([]byte, error) {
	return m.state[key], nil
}

func (m *mockChaincodeStub) PutState(key string, value []byte) error {
	m.state[key] = value
	m.history[key] = append(m.history[key], HistoryRecord{
		TxID:      "tx-mock",
		Value:     string(value),
		Timestamp: m.txTimestamp.AsTime().Format(time.RFC3339),
		IsDelete:  false,
	})
	return nil
}

func (m *mockChaincodeStub) DelState(key string) error {
	delete(m.state, key)
	return nil
}

func (m *mockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return fmt.Sprintf("\x00%s\x00%s\x00", objectType, strings.Join(attributes, "\x00")), nil
}

func (m *mockChaincodeStub) SplitCompositeKey(compositeKey string) (string, []string, error) {
	parts := strings.Split(strings.Trim(compositeKey, "\x00"), "\x00")
	if len(parts) < 1 {
		return "", nil, fmt.Errorf("invalid key")
	}
	return parts[0], parts[1:], nil
}

func (m *mockChaincodeStub) GetStateByPartialCompositeKey(objectType string, keys []string) (shim.StateQueryIteratorInterface, error) {
	prefix := fmt.Sprintf("\x00%s\x00%s", objectType, strings.Join(keys, "\x00"))
	var items []*queryresult.KV
	for k, v := range m.state {
		if strings.HasPrefix(k, prefix) {
			items = append(items, &queryresult.KV{
				Key:   k,
				Value: v,
			})
		}
	}
	return &mockStateQueryIterator{items: items}, nil
}

func (m *mockChaincodeStub) GetHistoryForKey(key string) (shim.HistoryQueryIteratorInterface, error) {
	return &mockHistoryQueryIterator{records: m.history[key]}, nil
}

func (m *mockChaincodeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return m.txTimestamp, nil
}

// Unused interface methods satisfied for mock
func (m *mockChaincodeStub) GetArgs() [][]byte                                        { return nil }
func (m *mockChaincodeStub) GetStringArgs() []string                                  { return nil }
func (m *mockChaincodeStub) GetFunctionAndParameters() (string, []string)             { return "", nil }
func (m *mockChaincodeStub) GetArgsSlice() ([]byte, error)                            { return nil, nil }
func (m *mockChaincodeStub) GetTxID() string                                          { return "mock-tx-id" }
func (m *mockChaincodeStub) GetChannelID() string                                     { return "trustledgerchannel" }
func (m *mockChaincodeStub) InvokeChaincode(string, [][]byte, string) peer.Response  { return peer.Response{} }
func (m *mockChaincodeStub) GetStateValidationParameter(string) ([]byte, error)       { return nil, nil }
func (m *mockChaincodeStub) SetStateValidationParameter(string, []byte) error         { return nil }
func (m *mockChaincodeStub) GetStateByRange(string, string) (shim.StateQueryIteratorInterface, error) {
	return nil, nil
}
func (m *mockChaincodeStub) GetStateByRangeWithPagination(string, string, int32, string) (shim.StateQueryIteratorInterface, *peer.QueryResponseMetadata, error) {
	return nil, nil, nil
}
func (m *mockChaincodeStub) GetStateByPartialCompositeKeyWithPagination(string, []string, int32, string) (shim.StateQueryIteratorInterface, *peer.QueryResponseMetadata, error) {
	return nil, nil, nil
}
func (m *mockChaincodeStub) GetQueryResult(string) (shim.StateQueryIteratorInterface, error) {
	return nil, nil
}
func (m *mockChaincodeStub) GetQueryResultWithPagination(string, int32, string) (shim.StateQueryIteratorInterface, *peer.QueryResponseMetadata, error) {
	return nil, nil, nil
}
func (m *mockChaincodeStub) GetPrivateData(string, string) ([]byte, error)               { return nil, nil }
func (m *mockChaincodeStub) GetPrivateDataHash(string, string) ([]byte, error)           { return nil, nil }
func (m *mockChaincodeStub) PutPrivateData(string, string, []byte) error                 { return nil }
func (m *mockChaincodeStub) DelPrivateData(string, string) error                         { return nil }
func (m *mockChaincodeStub) PurgePrivateData(string, string) error                       { return nil }
func (m *mockChaincodeStub) SetPrivateDataValidationParameter(string, string, []byte) error {
	return nil
}
func (m *mockChaincodeStub) GetPrivateDataValidationParameter(string, string) ([]byte, error) {
	return nil, nil
}
func (m *mockChaincodeStub) GetPrivateDataByRange(string, string, string) (shim.StateQueryIteratorInterface, error) {
	return nil, nil
}
func (m *mockChaincodeStub) GetPrivateDataByPartialCompositeKey(string, string, []string) (shim.StateQueryIteratorInterface, error) {
	return nil, nil
}
func (m *mockChaincodeStub) GetPrivateDataQueryResult(string, string) (shim.StateQueryIteratorInterface, error) {
	return nil, nil
}
func (m *mockChaincodeStub) SetEvent(string, []byte) error                               { return nil }
func (m *mockChaincodeStub) GetCreator() ([]byte, error)                                 { return nil, nil }
func (m *mockChaincodeStub) GetTransient() (map[string][]byte, error)                    { return nil, nil }
func (m *mockChaincodeStub) GetBinding() ([]byte, error)                                 { return nil, nil }
func (m *mockChaincodeStub) GetDecorations() map[string][]byte                           { return nil }
func (m *mockChaincodeStub) GetSignedProposal() (*peer.SignedProposal, error)            { return nil, nil }

type mockTxContext struct {
	stub     *mockChaincodeStub
	identity *mockClientIdentity
}

func (c *mockTxContext) GetStub() shim.ChaincodeStubInterface {
	return c.stub
}

func (c *mockTxContext) GetClientIdentity() (cid.ClientIdentity, error) {
	return c.identity, nil
}

func setupTestContext(mspID string, now time.Time) (*mockTxContext, *SmartContract) {
	stub := newMockStub(now)
	ctx := &mockTxContext{
		stub:     stub,
		identity: &mockClientIdentity{mspID: mspID},
	}
	return ctx, &SmartContract{}
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

func TestRegisterInstitution(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	// Valid registration
	err := cc.RegisterInstitution(ctx, "inst-bank-a", "BankAOrgMSP", "BANK")
	require.NoError(t, err)

	// Duplicate registration rejected
	err = cc.RegisterInstitution(ctx, "inst-bank-a", "BankAOrgMSP", "BANK")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Unauthorized caller (non-PlatformOrg)
	ctxWrong, ccWrong := setupTestContext("BankAOrgMSP", now)
	ctxWrong.stub = ctx.stub // Share state
	err = ccWrong.RegisterInstitution(ctxWrong, "inst-bank-b", "BankBOrgMSP", "BANK")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")

	// Invalid institution type
	err = cc.RegisterInstitution(ctx, "inst-invalid", "InvalidMSP", "INSURANCE")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid institution type")
}

func TestSetInstitutionStatus(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	err := cc.RegisterInstitution(ctx, "inst-bank-a", "BankAOrgMSP", "BANK")
	require.NoError(t, err)

	// Suspend
	err = cc.SetInstitutionStatus(ctx, "inst-bank-a", InstitutionStatusSuspended)
	require.NoError(t, err)

	// Reactivate
	err = cc.SetInstitutionStatus(ctx, "inst-bank-a", InstitutionStatusActive)
	require.NoError(t, err)

	// Non-existent institution
	err = cc.SetInstitutionStatus(ctx, "inst-nonexistent", InstitutionStatusSuspended)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")

	// Invalid status value
	err = cc.SetInstitutionStatus(ctx, "inst-bank-a", "TERMINATED")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid status")
}

func TestRegisterBusiness(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	err := cc.RegisterBusiness(ctx, "biz-uuid-001")
	require.NoError(t, err)

	// Duplicate businessRef rejected
	err = cc.RegisterBusiness(ctx, "biz-uuid-001")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Non-PlatformOrg rejected
	ctxBank, ccBank := setupTestContext("BankAOrgMSP", now)
	err = ccBank.RegisterBusiness(ctxBank, "biz-uuid-002")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")
}

func TestRegisterDocument(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	err := cc.RegisterBusiness(ctx, "biz-uuid-001")
	require.NoError(t, err)

	// Valid initial document registration (4 arguments per SPEC.md line 132)
	hash1 := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	err = cc.RegisterDocument(ctx, "doc-001", "biz-uuid-001", "GST_RETURN", hash1)
	require.NoError(t, err)

	// Duplicate identical contentHash rejected
	err = cc.RegisterDocument(ctx, "doc-001", "biz-uuid-001", "GST_RETURN", hash1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "identical contentHash")

	// Replacement with new hash creates version 2 (SPEC.md W1)
	hash2 := "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
	err = cc.RegisterDocument(ctx, "doc-001", "biz-uuid-001", "GST_RETURN", hash2)
	require.NoError(t, err)

	// Verify version 2 stored
	docKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeDocument, []string{"doc-001"})
	require.NoError(t, err)
	docBytes, err := ctx.GetStub().GetState(docKey)
	require.NoError(t, err)
	var doc Document
	require.NoError(t, json.Unmarshal(docBytes, &doc))
	assert.Equal(t, 2, doc.Version)
	assert.Equal(t, hash2, doc.ContentHash)

	// Invalid hash format rejected
	err = cc.RegisterDocument(ctx, "doc-002", "biz-uuid-001", "GST_RETURN", "not-a-valid-sha256")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid contentHash")

	// Missing business rejected
	err = cc.RegisterDocument(ctx, "doc-003", "biz-nonexistent", "GST_RETURN", hash1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist")
}

func TestCreateConsent(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, cc.RegisterInstitution(ctx, "inst-bank-a", "BankAOrgMSP", "BANK"))
	require.NoError(t, cc.RegisterBusiness(ctx, "biz-001"))

	hashDoc := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	require.NoError(t, cc.RegisterDocument(ctx, "doc-001", "biz-001", "GST_RETURN", hashDoc))

	validExpiry := now.Add(7 * 24 * time.Hour).Format(time.RFC3339)
	validEvidenceHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	err := cc.CreateConsent(ctx, "consent-001", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC_VERIFICATION", validExpiry, validEvidenceHash)
	require.NoError(t, err)

	// Duplicate consentId rejected
	err = cc.CreateConsent(ctx, "consent-001", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC_VERIFICATION", validExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Invalid evidence hash rejected
	err = cc.CreateConsent(ctx, "consent-bad-hash", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC", validExpiry, "invalid-evidence")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid approvalEvidenceHash")

	// Expiry exceeding 30-day limit rejected
	invalidLongExpiry := now.Add(31 * 24 * time.Hour).Format(time.RFC3339)
	err = cc.CreateConsent(ctx, "consent-002", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC", invalidLongExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds 30-day maximum limit")

	// Past expiry rejected
	pastExpiry := now.Add(-1 * time.Hour).Format(time.RFC3339)
	err = cc.CreateConsent(ctx, "consent-003", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC", pastExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "MUST be in the future")

	// Document consent with empty docRefs rejected
	err = cc.CreateConsent(ctx, "consent-empty-docs", "biz-001", "inst-bank-a", ScopeTypeDocuments, `[]`, "KYC", validExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "docRefs must not be empty")

	// Document consent with unapproved/missing document rejected
	err = cc.CreateConsent(ctx, "consent-missing-doc", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-999"]`, "KYC", validExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist on ledger")

	// Suspended institution consent rejected
	require.NoError(t, cc.SetInstitutionStatus(ctx, "inst-bank-a", InstitutionStatusSuspended))
	err = cc.CreateConsent(ctx, "consent-004", "biz-001", "inst-bank-a", ScopeTypeDocuments, `["doc-001"]`, "KYC", validExpiry, validEvidenceHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "suspended institution")
}

func TestRevokeConsent(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, cc.RegisterInstitution(ctx, "inst-bank-a", "BankAOrgMSP", "BANK"))
	require.NoError(t, cc.RegisterBusiness(ctx, "biz-001"))

	expiry := now.Add(24 * time.Hour).Format(time.RFC3339)
	validEvidenceHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	require.NoError(t, cc.CreateConsent(ctx, "consent-001", "biz-001", "inst-bank-a", ScopeTypeProfile, "[]", "KYC", expiry, validEvidenceHash))

	// Revoke
	err := cc.RevokeConsent(ctx, "consent-001")
	require.NoError(t, err)

	// Revoking already revoked consent rejected
	err = cc.RevokeConsent(ctx, "consent-001")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already revoked")
}

func TestIssueAndManageAttestation(t *testing.T) {
	now := time.Now().UTC()
	ctxPlatform, ccPlatform := setupTestContext(PlatformOrgMSP, now)

	// Setup institution and business
	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-bank-a", "BankAOrgMSP", "BANK"))
	require.NoError(t, ccPlatform.RegisterBusiness(ctxPlatform, "biz-001"))

	// Issue attestation as BankAOrg
	ctxBank, ccBank := setupTestContext("BankAOrgMSP", now)
	ctxBank.stub = ctxPlatform.stub // Share ledger state

	validUntil := now.Add(180 * 24 * time.Hour).Format(time.RFC3339)
	validSnapshots := `["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]`
	err := ccBank.IssueAttestation(ctxBank, "att-001", "biz-001", "KYC_VERIFIED", validSnapshots, validUntil)
	require.NoError(t, err)

	// Duplicate attId rejected
	err = ccBank.IssueAttestation(ctxBank, "att-001", "biz-001", "KYC_VERIFIED", validSnapshots, validUntil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Attestation exceeding 24 months validity rejected (§8.5)
	invalidLongVal := now.AddDate(0, 25, 0).Format(time.RFC3339)
	err = ccBank.IssueAttestation(ctxBank, "att-too-long", "biz-001", "KYC", validSnapshots, invalidLongVal)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds 24-month maximum")

	// Invalid snapshot hash rejected
	err = ccBank.IssueAttestation(ctxBank, "att-bad-snap", "biz-001", "KYC", `["invalid-hex"]`, validUntil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid docHashSnapshot")

	// Suspend attestation by issuing institution
	err = ccBank.UpdateAttestationStatus(ctxBank, "att-001", AttestationStatusSuspended, "DOCUMENT_EXPIRED")
	require.NoError(t, err)

	// Update to same status rejected
	err = ccBank.UpdateAttestationStatus(ctxBank, "att-001", AttestationStatusSuspended, "ALREADY_SUSPENDED")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already SUSPENDED")

	// Reinstatement backwards from SUSPENDED -> VALID rejected (D-9)
	err = ccBank.UpdateAttestationStatus(ctxBank, "att-001", AttestationStatusValid, "REINSTATED")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "reinstatement not permitted")

	// Transition SUSPENDED -> REVOKED permitted
	err = ccBank.UpdateAttestationStatus(ctxBank, "att-001", AttestationStatusRevoked, "FRAUD_DETECTED")
	require.NoError(t, err)

	// Transition from REVOKED rejected (terminal state)
	err = ccBank.UpdateAttestationStatus(ctxBank, "att-001", AttestationStatusSuspended, "REOPEN")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "terminal state")

	// Update by non-issuing organization rejected
	ctxOther, ccOther := setupTestContext("NbfcOrgMSP", now)
	ctxOther.stub = ctxPlatform.stub
	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-nbfc", "NbfcOrgMSP", "NBFC"))

	err = ccOther.UpdateAttestationStatus(ctxOther, "att-001", AttestationStatusSuspended, "UNAUTHORIZED")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "did not issue attestation")
}

func TestGetAttestationsWithProfileConsent(t *testing.T) {
	now := time.Now().UTC()
	ctxPlatform, ccPlatform := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-bank", "BankAOrgMSP", "BANK"))
	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-nbfc", "NbfcOrgMSP", "NBFC"))
	require.NoError(t, ccPlatform.RegisterBusiness(ctxPlatform, "biz-001"))

	// Bank A issues attestation
	ctxBank, ccBank := setupTestContext("BankAOrgMSP", now)
	ctxBank.stub = ctxPlatform.stub
	validUntil := now.Add(90 * 24 * time.Hour).Format(time.RFC3339)
	validSnapshots := `["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]`
	require.NoError(t, ccBank.IssueAttestation(ctxBank, "att-101", "biz-001", "KYC_VERIFIED", validSnapshots, validUntil))

	// NBFC queries attestations through active PROFILE consent
	ctxNbfc, ccNbfc := setupTestContext("NbfcOrgMSP", now)
	ctxNbfc.stub = ctxPlatform.stub

	expiry := now.Add(5 * 24 * time.Hour).Format(time.RFC3339)
	validEvidenceHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	require.NoError(t, ccPlatform.CreateConsent(ctxPlatform, "consent-prof-1", "biz-001", "inst-nbfc", ScopeTypeProfile, "[]", "CREDIT_CHECK", expiry, validEvidenceHash))

	// Query attestations
	results, err := ccNbfc.GetAttestations(ctxNbfc, "biz-001", "consent-prof-1")
	require.NoError(t, err)
	assert.Len(t, results, 1)
	assert.Equal(t, "att-101", results[0].AttID)

	// Query from different institution without consent rejected
	ctxBankOther, ccBankOther := setupTestContext("BankAOrgMSP", now)
	ctxBankOther.stub = ctxPlatform.stub
	_, err = ccBankOther.GetAttestations(ctxBankOther, "biz-001", "consent-prof-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")

	// Query with DOCUMENTS consent instead of PROFILE rejected
	hashDoc := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	require.NoError(t, ccPlatform.RegisterDocument(ctxPlatform, "doc-1", "biz-001", "DOC", hashDoc))
	require.NoError(t, ccPlatform.CreateConsent(ctxPlatform, "consent-doc-1", "biz-001", "inst-nbfc", ScopeTypeDocuments, `["doc-1"]`, "KYC", expiry, validEvidenceHash))
	_, err = ccNbfc.GetAttestations(ctxNbfc, "biz-001", "consent-doc-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expected PROFILE")

	// Query with revoked consent rejected
	require.NoError(t, ccPlatform.RevokeConsent(ctxPlatform, "consent-prof-1"))
	_, err = ccNbfc.GetAttestations(ctxNbfc, "biz-001", "consent-prof-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "REVOKED")
}

func TestCheckAccessScenarios(t *testing.T) {
	now := time.Now().UTC()
	ctxPlatform, ccPlatform := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-bank-a", "BankAOrgMSP", "BANK"))
	require.NoError(t, ccPlatform.RegisterBusiness(ctxPlatform, "biz-001"))

	hashDoc1 := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	hashDoc2 := "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
	require.NoError(t, ccPlatform.RegisterDocument(ctxPlatform, "doc-uuid-1", "biz-001", "GST", hashDoc1))
	require.NoError(t, ccPlatform.RegisterDocument(ctxPlatform, "doc-uuid-2", "biz-001", "PAN", hashDoc2))

	expiry := now.Add(24 * time.Hour).Format(time.RFC3339)
	docRefs := `["doc-uuid-1", "doc-uuid-2"]`
	validEvidenceHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	require.NoError(t, ccPlatform.CreateConsent(ctxPlatform, "consent-access-1", "biz-001", "inst-bank-a", ScopeTypeDocuments, docRefs, "KYC", expiry, validEvidenceHash))

	// 1. Allowed document access
	res, err := ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-a", ScopeTypeDocuments, "doc-uuid-1")
	require.NoError(t, err)
	assert.True(t, res.Allowed)
	assert.Equal(t, ReasonAccessAllowed, res.ReasonCode)

	// 2. Document not in scope
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-a", ScopeTypeDocuments, "doc-uuid-unapproved")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonDocNotInScope, res.ReasonCode)

	// 3. Scope mismatch
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-a", ScopeTypeProfile, "")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonScopeMismatch, res.ReasonCode)

	// 4. Institution mismatch
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-other", ScopeTypeDocuments, "doc-uuid-1")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonInstitutionMismatch, res.ReasonCode)

	// 5. Consent not found
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-nonexistent", "inst-bank-a", ScopeTypeDocuments, "doc-uuid-1")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonConsentNotFound, res.ReasonCode)

	// 6. Suspended institution
	require.NoError(t, ccPlatform.SetInstitutionStatus(ctxPlatform, "inst-bank-a", InstitutionStatusSuspended))
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-a", ScopeTypeDocuments, "doc-uuid-1")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonInstitutionSuspended, res.ReasonCode)

	// 7. Revoked consent
	require.NoError(t, ccPlatform.SetInstitutionStatus(ctxPlatform, "inst-bank-a", InstitutionStatusActive))
	require.NoError(t, ccPlatform.RevokeConsent(ctxPlatform, "consent-access-1"))
	res, err = ccPlatform.CheckAccess(ctxPlatform, "consent-access-1", "inst-bank-a", ScopeTypeDocuments, "doc-uuid-1")
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Equal(t, ReasonConsentRevoked, res.ReasonCode)
}

func TestRecordAccessEvent(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, cc.RegisterInstitution(ctx, "inst-01", "Inst01MSP", "BANK"))
	require.NoError(t, cc.RegisterBusiness(ctx, "biz-01"))

	expiry := now.Add(24 * time.Hour).Format(time.RFC3339)
	validEvidenceHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	require.NoError(t, cc.CreateConsent(ctx, "consent-01", "biz-01", "inst-01", ScopeTypeProfile, "[]", "KYC", expiry, validEvidenceHash))

	err := cc.RecordAccessEvent(ctx, "evt-001", "consent-01", "inst-01", "doc-01", ActionDocumentViewed)
	require.NoError(t, err)

	// Duplicate eventId rejected
	err = cc.RecordAccessEvent(ctx, "evt-001", "consent-01", "inst-01", "doc-01", ActionDocumentViewed)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Missing consent rejected
	err = cc.RecordAccessEvent(ctx, "evt-002", "consent-nonexistent", "inst-01", "doc-01", ActionDocumentViewed)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist")

	// Invalid action rejected
	err = cc.RecordAccessEvent(ctx, "evt-003", "consent-01", "inst-01", "doc-01", "INVALID_ACTION")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid action")
}

func TestRecordAssessment(t *testing.T) {
	now := time.Now().UTC()
	ctxPlatform, ccPlatform := setupTestContext(PlatformOrgMSP, now)

	require.NoError(t, ccPlatform.RegisterInstitution(ctxPlatform, "inst-bank-a", "BankAOrgMSP", "BANK"))
	require.NoError(t, ccPlatform.RegisterBusiness(ctxPlatform, "biz-001"))

	ctxBank, ccBank := setupTestContext("BankAOrgMSP", now)
	ctxBank.stub = ctxPlatform.stub

	validReportHash := "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
	err := ccBank.RecordAssessment(ctxBank, "ass-001", "biz-001", "v1.0", RiskBandLow, validReportHash)
	require.NoError(t, err)

	// Duplicate assessmentId rejected
	err = ccBank.RecordAssessment(ctxBank, "ass-001", "biz-001", "v1.0", RiskBandLow, validReportHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Invalid reportHash rejected
	err = ccBank.RecordAssessment(ctxBank, "ass-bad-hash", "biz-001", "v1.0", RiskBandLow, "not-a-valid-hex-hash")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid reportHash")

	// Invalid risk band rejected
	err = ccBank.RecordAssessment(ctxBank, "ass-002", "biz-001", "v1.0", "CRITICAL", validReportHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid riskBand")

	// Missing business rejected
	err = ccBank.RecordAssessment(ctxBank, "ass-003", "biz-nonexistent", "v1.0", RiskBandMedium, validReportHash)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist")
}

func TestGetHistory(t *testing.T) {
	now := time.Now().UTC()
	ctx, cc := setupTestContext(PlatformOrgMSP, now)

	// Register institution and update status to produce multiple history entries
	require.NoError(t, cc.RegisterInstitution(ctx, "inst-hist-1", "BankAOrgMSP", "BANK"))
	require.NoError(t, cc.SetInstitutionStatus(ctx, "inst-hist-1", InstitutionStatusSuspended))
	require.NoError(t, cc.SetInstitutionStatus(ctx, "inst-hist-1", InstitutionStatusActive))

	instKey, err := ctx.GetStub().CreateCompositeKey(KeyTypeInstitution, []string{"inst-hist-1"})
	require.NoError(t, err)

	history, err := cc.GetHistory(ctx, instKey)
	require.NoError(t, err)
	assert.Len(t, history, 3)
	assert.False(t, history[0].IsDelete)
	assert.NotEmpty(t, history[0].TxID)

	// Unauthorized caller rejected
	ctxUnauthorized, ccUnauthorized := setupTestContext("UnknownMSP", now)
	ctxUnauthorized.stub = ctx.stub
	_, err = ccUnauthorized.GetHistory(ctxUnauthorized, instKey)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")
}

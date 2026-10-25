import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InstitutionStatus, UserRole, KycOutcome, AttestationStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LEDGER_SERVICE } from '../ledger/ledger.interface';
import { AttestationsService } from './attestations.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

describe('AttestationsService (Stage 7 Unit Tests)', () => {
  let service: AttestationsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockNotifications: any;
  let mockLedger: any;

  const testOfficer: AuthenticatedUser = {
    id: 'officer-user-1',
    email: 'officer@banka.com',
    role: UserRole.KYC_OFFICER,
    status: 'ACTIVE' as any,
    institutionId: 'inst-bank-a',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'BankAOrgMSP',
  };

  const testOtherOfficer: AuthenticatedUser = {
    id: 'officer-user-2',
    email: 'officer@bankb.com',
    role: UserRole.KYC_OFFICER,
    status: 'ACTIVE' as any,
    institutionId: 'inst-bank-b',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'BankBOrgMSP',
  };

  const testNbfcOfficer: AuthenticatedUser = {
    id: 'officer-nbfc-1',
    email: 'officer@nbfc.com',
    role: UserRole.KYC_OFFICER,
    status: 'ACTIVE' as any,
    institutionId: 'inst-nbfc',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'NbfcOrgMSP',
  };

  const testBusinessOwner: AuthenticatedUser = {
    id: 'owner-user-1',
    email: 'owner@msme.com',
    role: UserRole.BUSINESS_OWNER,
    status: 'ACTIVE' as any,
    businessId: 'biz-123',
  };

  const testSessionId = 'session-uuid-1';
  const testConsentId = 'consent-uuid-1';
  const testBusinessId = 'biz-123';
  const testBusinessRef = 'biz-ref-xyz-123';
  const testDocRef1 = 'doc-ref-pan-001';
  const testDocRef2 = 'doc-ref-gst-002';
  const testHash1 = crypto.createHash('sha256').update('doc-bytes-1').digest('hex');
  const testHash2 = crypto.createHash('sha256').update('doc-bytes-2').digest('hex');

  beforeEach(async () => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    mockLedger = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ACCESS_GRANTED' }),
      submitTransaction: jest.fn().mockResolvedValue('tx-hash-attestation-101'),
      evaluateTransaction: jest.fn().mockResolvedValue('[]'),
    };

    mockPrisma = {
      accessSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: testSessionId,
          officerUserId: testOfficer.id,
          institutionId: testOfficer.institutionId,
          consentId: testConsentId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          viewedDocRefs: [testDocRef1, testDocRef2],
        }),
      },
      consentGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'consent-db-1',
          consentId: testConsentId,
          businessRef: testBusinessRef,
          institutionId: testOfficer.institutionId,
          scopeType: 'DOCUMENTS',
          docRefs: [testDocRef1, testDocRef2],
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        }),
      },
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: testBusinessId,
          businessRef: testBusinessRef,
          ownerUserId: testBusinessOwner.id,
        }),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'doc-1',
            docRef: testDocRef1,
            businessId: testBusinessId,
            contentHash: testHash1,
            status: 'AVAILABLE',
          },
          {
            id: 'doc-2',
            docRef: testDocRef2,
            businessId: testBusinessId,
            contentHash: testHash2,
            status: 'AVAILABLE',
          },
        ]),
      },
      kycReview: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'review-uuid-1',
          ...data,
          createdAt: new Date(),
        })),
        findUnique: jest.fn().mockResolvedValue({
          id: 'review-uuid-1',
          businessId: testBusinessId,
          institutionId: testOfficer.institutionId,
          officerUserId: testOfficer.id,
          consentId: testConsentId,
          accessSessionId: testSessionId,
          outcome: KycOutcome.VERIFIED,
          checklist: JSON.stringify({ panVerified: true, gstVerified: true }),
          notes: 'PAN and GST verified against tax authority portal records',
          docRefsReviewed: [testDocRef1, testDocRef2],
          attestationId: null,
          createdAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({ id: 'review-uuid-1' }),
      },
      attestation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          ...data,
          createdAt: new Date(),
        })),
        findUnique: jest.fn().mockResolvedValue({
          attId: 'att-uuid-101',
          businessRef: testBusinessRef,
          issuerInstId: 'BankAOrgMSP',
          type: 'KYC_BASIC',
          status: AttestationStatus.VALID,
          validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000),
          docHashSnapshot: [testHash1, testHash2],
          ledgerTxId: 'tx-hash-attestation-101',
          createdAt: new Date(),
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          attId: 'att-uuid-101',
          status: data.status,
          ledgerTxId: data.ledgerTxId,
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      institution: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inst-bank-a',
          name: 'Bank of India',
          type: 'BANK',
          mspId: 'BankAOrgMSP',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttestationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: LEDGER_SERVICE, useValue: mockLedger },
      ],
    }).compile();

    service = module.get<AttestationsService>(AttestationsService);
  });

  describe('1. KYC Review Records (W3 Step 4)', () => {
    const validDto = {
      consentId: testConsentId,
      accessSessionId: testSessionId,
      outcome: KycOutcome.VERIFIED,
      checklist: { panMatch: true, gstActive: true },
      notes: 'PAN card and GST certificate verified with portal records',
      docRefsReviewed: [testDocRef1, testDocRef2],
    };

    it('creates a KYC review successfully for authorized KYC officer with active session', async () => {
      const res = await service.createKycReview(testOfficer, validDto);
      expect(res.reviewId).toBe('review-uuid-1');
      expect(res.outcome).toBe(KycOutcome.VERIFIED);
      expect(res.docRefsReviewed).toEqual([testDocRef1, testDocRef2]);

      expect(mockPrisma.kycReview.create).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'KYC_REVIEW_RECORDED',
          entityType: 'KycReview',
          metadata: expect.not.objectContaining({ notes: expect.anything() }),
        }),
      );
    });

    it('rejects review creation by non-KYC officers', async () => {
      const nonKycOfficer = { ...testOfficer, role: UserRole.LOAN_OFFICER };
      await expect(service.createKycReview(nonKycOfficer, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects review creation by suspended institution officer (I-5)', async () => {
      const suspendedOfficer = { ...testOfficer, institutionStatus: InstitutionStatus.SUSPENDED };
      await expect(service.createKycReview(suspendedOfficer, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects review creation if session not found', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce(null);
      await expect(service.createKycReview(testOfficer, validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects review creation if session belongs to another officer or institution', async () => {
      await expect(service.createKycReview(testOtherOfficer, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects review creation if session is not ACTIVE', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: testSessionId,
        officerUserId: testOfficer.id,
        institutionId: testOfficer.institutionId,
        consentId: testConsentId,
        status: 'PENDING_OTP',
        expiresAt: new Date(Date.now() + 10000),
        viewedDocRefs: [testDocRef1],
      });
      await expect(service.createKycReview(testOfficer, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects review creation if session has expired', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: testSessionId,
        officerUserId: testOfficer.id,
        institutionId: testOfficer.institutionId,
        consentId: testConsentId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1000),
        viewedDocRefs: [testDocRef1],
      });
      await expect(service.createKycReview(testOfficer, validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects review creation if consentId does not match session', async () => {
      await expect(
        service.createKycReview(testOfficer, { ...validDto, consentId: 'other-consent' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects review referencing documents that were NOT viewed during the session', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: testSessionId,
        officerUserId: testOfficer.id,
        institutionId: testOfficer.institutionId,
        consentId: testConsentId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 10000),
        viewedDocRefs: [testDocRef1], // only doc1 viewed, doc2 NOT viewed!
      });

      await expect(service.createKycReview(testOfficer, validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects review referencing documents not within the consent scope', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValueOnce({
        id: 'consent-db-1',
        consentId: testConsentId,
        businessRef: testBusinessRef,
        institutionId: testOfficer.institutionId,
        scopeType: 'DOCUMENTS',
        docRefs: [testDocRef1], // doc2 not in consent docRefs
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.createKycReview(testOfficer, validDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Attestation Issuance (W3 Step 5)', () => {
    const issueDto = {
      kycReviewId: 'review-uuid-1',
      validityMonths: 12,
      type: 'KYC_BASIC',
    };

    it('issues attestation on Drunix for eligible VERIFIED review with docHashSnapshot from viewed documents', async () => {
      const res = await service.issueAttestation(testOfficer, issueDto);

      expect(res.attId).toBeDefined();
      expect(res.status).toBe(AttestationStatus.VALID);
      expect(res.type).toBe('KYC_BASIC');
      expect(res.docHashSnapshotCount).toBe(2);

      // Verify submitTransaction called with acting org and doc hashes
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'BankAOrgMSP',
        'IssueAttestation',
        expect.any(String),
        testBusinessRef,
        'KYC_BASIC',
        JSON.stringify([testHash1, testHash2]),
        expect.any(String),
      );

      // Verify DB projection saved and review linked
      expect(mockPrisma.attestation.create).toHaveBeenCalled();
      expect(mockPrisma.kycReview.update).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTESTATION_ISSUED' }),
      );
      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ATTESTATION_ISSUED' }),
      );
    });

    it('rejects attestation issuance for non-VERIFIED reviews (e.g. REJECTED)', async () => {
      mockPrisma.kycReview.findUnique.mockResolvedValueOnce({
        id: 'review-uuid-1',
        institutionId: testOfficer.institutionId,
        outcome: KycOutcome.NOT_VERIFIED,
      });

      await expect(service.issueAttestation(testOfficer, issueDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate attestation issuance for a review that already resulted in an attestation', async () => {
      mockPrisma.kycReview.findUnique.mockResolvedValueOnce({
        id: 'review-uuid-1',
        institutionId: testOfficer.institutionId,
        outcome: KycOutcome.VERIFIED,
        attestationId: 'existing-attestation-uuid',
      });

      await expect(service.issueAttestation(testOfficer, issueDto)).rejects.toThrow(ConflictException);
    });

    it('rejects issuance when review belongs to another institution', async () => {
      await expect(service.issueAttestation(testOtherOfficer, issueDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects issuance if reviewed documents are missing or marked DELETED', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: 'doc-1', docRef: testDocRef1, contentHash: testHash1, status: 'AVAILABLE' },
        // doc-2 missing
      ]);

      await expect(service.issueAttestation(testOfficer, issueDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects issuance when validity months exceed 24 (SPEC §8.5)', async () => {
      await expect(
        service.issueAttestation(testOfficer, { ...issueDto, validityMonths: 25 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails closed when ledger transaction submission fails (I-1)', async () => {
      mockLedger.submitTransaction.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(service.issueAttestation(testOfficer, issueDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Attestation Status Transitions (W3 Step 6 & D-9)', () => {
    it('successfully transitions attestation from VALID to SUSPENDED with reason code', async () => {
      const res = await service.updateAttestationStatus(testOfficer, 'att-uuid-101', {
        status: 'SUSPENDED',
        reasonCode: 'SUSPICIOUS_DOCUMENT_FLAGGED',
      });

      expect(res.status).toBe('SUSPENDED');
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'BankAOrgMSP',
        'UpdateAttestationStatus',
        'att-uuid-101',
        'SUSPENDED',
        'SUSPICIOUS_DOCUMENT_FLAGGED',
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTESTATION_STATUS_CHANGED' }),
      );
    });

    it('successfully transitions attestation from VALID to REVOKED', async () => {
      const res = await service.updateAttestationStatus(testOfficer, 'att-uuid-101', {
        status: 'REVOKED',
        reasonCode: 'FRAUD_CONFIRMED',
      });
      expect(res.status).toBe('REVOKED');
    });

    it('rejects update if caller institution did not issue the attestation', async () => {
      await expect(
        service.updateAttestationStatus(testOtherOfficer, 'att-uuid-101', {
          status: 'SUSPENDED',
          reasonCode: 'TEST',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects transitions from terminal state REVOKED (D-9)', async () => {
      mockPrisma.attestation.findUnique.mockResolvedValueOnce({
        attId: 'att-uuid-101',
        issuerInstId: 'BankAOrgMSP',
        status: AttestationStatus.REVOKED,
        validUntil: new Date(Date.now() + 1000000),
      });

      await expect(
        service.updateAttestationStatus(testOfficer, 'att-uuid-101', {
          status: 'SUSPENDED',
          reasonCode: 'TEST',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects status update for expired attestations', async () => {
      mockPrisma.attestation.findUnique.mockResolvedValueOnce({
        attId: 'att-uuid-101',
        issuerInstId: 'BankAOrgMSP',
        status: AttestationStatus.VALID,
        validUntil: new Date(Date.now() - 1000), // Expired!
      });

      await expect(
        service.updateAttestationStatus(testOfficer, 'att-uuid-101', {
          status: 'SUSPENDED',
          reasonCode: 'TEST',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails closed when ledger status update fails (I-1)', async () => {
      mockLedger.submitTransaction.mockRejectedValueOnce(new Error('Chaincode error'));
      await expect(
        service.updateAttestationStatus(testOfficer, 'att-uuid-101', {
          status: 'SUSPENDED',
          reasonCode: 'TEST',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Cross-Institution Attestation Lookup (W5)', () => {
    const profileConsentId = 'consent-profile-nbfc';

    beforeEach(() => {
      mockPrisma.consentGrant.findUnique.mockResolvedValue({
        id: 'consent-nbfc-db',
        consentId: profileConsentId,
        businessRef: testBusinessRef,
        institutionId: testNbfcOfficer.institutionId,
        scopeType: 'PROFILE',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      });

      const onChainAtt = {
        attId: 'att-uuid-101',
        businessRef: testBusinessRef,
        issuerInstId: 'BankAOrgMSP',
        type: 'KYC_BASIC',
        status: 'VALID',
        docHashSnapshot: [testHash1, testHash2],
        issuedAt: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      };

      mockLedger.evaluateTransaction.mockResolvedValue(JSON.stringify([onChainAtt]));
    });

    it('returns allowlisted attestation data with documentsUnchangedSinceAttestation=true when hashes match', async () => {
      const results = await service.lookupAttestations(testNbfcOfficer, profileConsentId);

      expect(results.length).toBe(1);
      const att = results[0];
      expect(att.attId).toBe('att-uuid-101');
      expect(att.businessRef).toBe(testBusinessRef);
      expect(att.type).toBe('KYC_BASIC');
      expect(att.status).toBe('VALID');
      expect(att.issuerInstitution.name).toBe('Bank of India');
      expect(att.documentsUnchangedSinceAttestation).toBe(true);

      // Verify no internal review details leaked
      expect((att as any).notes).toBeUndefined();
      expect((att as any).checklist).toBeUndefined();
      expect((att as any).officerUserId).toBeUndefined();
    });

    it('evaluates documentsUnchangedSinceAttestation=false when a document was modified or replaced', async () => {
      // Simulate document replacement: doc2 has new hash
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: 'doc-1', docRef: testDocRef1, contentHash: testHash1, status: 'AVAILABLE' },
        { id: 'doc-2-v2', docRef: testDocRef2, contentHash: 'new-version-hash-replaced', status: 'AVAILABLE' },
      ]);

      const results = await service.lookupAttestations(testNbfcOfficer, profileConsentId);
      expect(results[0].documentsUnchangedSinceAttestation).toBe(false);
    });

    it('dynamically computes EXPIRED status when validUntil is in the past', async () => {
      const expiredAtt = {
        attId: 'att-uuid-expired',
        businessRef: testBusinessRef,
        issuerInstId: 'BankAOrgMSP',
        type: 'KYC_BASIC',
        status: 'VALID',
        docHashSnapshot: [testHash1],
        issuedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
        validUntil: new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString(), // Expired 35 days ago
      };
      mockLedger.evaluateTransaction.mockResolvedValueOnce(JSON.stringify([expiredAtt]));

      const results = await service.lookupAttestations(testNbfcOfficer, profileConsentId);
      expect(results[0].status).toBe('EXPIRED');
      expect(results[0].documentsUnchangedSinceAttestation).toBe(false);
    });

    it('rejects lookup if consent scope is DOCUMENTS rather than PROFILE', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValueOnce({
        id: 'consent-nbfc-db',
        consentId: profileConsentId,
        businessRef: testBusinessRef,
        institutionId: testNbfcOfficer.institutionId,
        scopeType: 'DOCUMENTS', // invalid scope!
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.lookupAttestations(testNbfcOfficer, profileConsentId)).rejects.toThrow(ForbiddenException);
    });

    it('rejects lookup if consent is revoked or expired', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValueOnce({
        id: 'consent-nbfc-db',
        consentId: profileConsentId,
        businessRef: testBusinessRef,
        institutionId: testNbfcOfficer.institutionId,
        scopeType: 'PROFILE',
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.lookupAttestations(testNbfcOfficer, profileConsentId)).rejects.toThrow(ForbiddenException);
    });

    it('fails closed when ledger CheckAccess denies access (I-1)', async () => {
      mockLedger.checkAccess.mockResolvedValueOnce({ allowed: false, reasonCode: 'LEDGER_DENIED' });
      await expect(service.lookupAttestations(testNbfcOfficer, profileConsentId)).rejects.toThrow(ForbiddenException);
    });

    it('fails closed when ledger is unreachable during lookup (I-1)', async () => {
      mockLedger.checkAccess.mockRejectedValueOnce(new Error('Fabric network unreachable'));
      await expect(service.lookupAttestations(testNbfcOfficer, profileConsentId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Business Owner Attestations View', () => {
    it('returns attestations for business owner with dynamic expiration', async () => {
      mockPrisma.attestation.findMany.mockResolvedValueOnce([
        {
          attId: 'att-1',
          businessRef: testBusinessRef,
          type: 'KYC_BASIC',
          status: AttestationStatus.VALID,
          validUntil: new Date(Date.now() + 100000000),
          docHashSnapshot: [testHash1],
          createdAt: new Date(),
        },
      ]);

      const res = await service.getBusinessAttestations(testBusinessOwner);
      expect(res.length).toBe(1);
      expect(res[0].attId).toBe('att-1');
      expect(res[0].status).toBe('VALID');
    });

    it('rejects non-business owner caller', async () => {
      await expect(service.getBusinessAttestations(testOfficer)).rejects.toThrow(ForbiddenException);
    });
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { LedgerService, CheckAccessResponse } from './ledger.interface';
import { PrismaService } from '../prisma.service';

interface OnChainInstitution {
  instId: string;
  mspId: string;
  type: string;
  status: string;
}

interface OnChainBusiness {
  businessRef: string;
  createdAt: string;
}

interface OnChainDocument {
  docRef: string;
  businessRef: string;
  docType: string;
  contentHash: string;
  version: number;
  registeredAt: string;
}

interface OnChainConsent {
  consentId: string;
  businessRef: string;
  institutionId: string;
  scopeType: string;
  docRefs: string[];
  purposeCode: string;
  expiresAt: string;
  status: string;
  approvalEvidenceHash: string;
}

interface OnChainAttestation {
  attId: string;
  businessRef: string;
  issuerInstId: string;
  type: string;
  status: string;
  docHashSnapshot: string[];
  issuedAt: string;
  validUntil: string;
  reasonCode?: string;
}

@Injectable()
export class InMemoryLedgerService implements LedgerService {
  private readonly logger = new Logger(InMemoryLedgerService.name);
  private healthy = true;

  // Ledger state stores keyed by composite keys
  private institutions = new Map<string, OnChainInstitution>();
  private institutionByMsp = new Map<string, string>();
  private businesses = new Map<string, OnChainBusiness>();
  private documents = new Map<string, OnChainDocument>();
  private consents = new Map<string, OnChainConsent>();
  private attestations = new Map<string, OnChainAttestation>();
  private accessEvents = new Map<string, Record<string, unknown>>();
  private assessments = new Map<string, Record<string, unknown>>();
  private history = new Map<string, Array<{ txId: string; value: string; timestamp: string }>>();

  constructor(private readonly prisma: PrismaService) {
    // Seed default institutions
    this.institutions.set('PlatformOrg', {
      instId: 'PlatformOrg',
      mspId: 'PlatformOrgMSP',
      type: 'PLATFORM',
      status: 'ACTIVE',
    });
    this.institutionByMsp.set('PlatformOrgMSP', 'PlatformOrg');

    this.institutions.set('BankA', {
      instId: 'BankA',
      mspId: 'BankAOrgMSP',
      type: 'BANK',
      status: 'ACTIVE',
    });
    this.institutionByMsp.set('BankAOrgMSP', 'BankA');

    this.institutions.set('Nbfc', {
      instId: 'Nbfc',
      mspId: 'NbfcOrgMSP',
      type: 'NBFC',
      status: 'ACTIVE',
    });
    this.institutionByMsp.set('NbfcOrgMSP', 'Nbfc');
  }

  setHealthy(isHealthy: boolean): void {
    this.healthy = isHealthy;
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  private ensureHealthy(): void {
    if (!this.healthy) {
      throw new Error('LEDGER_UNAVAILABLE: Drunix ledger node unreachable');
    }
  }

  private async recordTxMetric(
    fnName: string,
    status: 'SUCCESS' | 'FAILED',
    startMs: number,
  ): Promise<string> {
    const latencyMs = Math.max(1, Date.now() - startMs);
    const txId = `tx-mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      await this.prisma.ledgerTx.create({
        data: {
          chaincodeFunction: fnName,
          txId,
          status,
          latencyMs,
          at: new Date(),
        },
      });
    } catch {
      // Ignore DB metric errors in tests
    }
    return txId;
  }

  async submitTransaction(
    actingOrgMsp: string,
    functionName: string,
    ...args: string[]
  ): Promise<string> {
    const start = Date.now();
    this.ensureHealthy();

    try {
      let result = '';
      switch (functionName) {
        case 'RegisterInstitution':
          result = this.registerInstitution(actingOrgMsp, args[0], args[1], args[2]);
          break;
        case 'SetInstitutionStatus':
          result = this.setInstitutionStatus(actingOrgMsp, args[0], args[1]);
          break;
        case 'RegisterBusiness':
          result = this.registerBusiness(actingOrgMsp, args[0]);
          break;
        case 'RegisterDocument':
          result = this.registerDocument(actingOrgMsp, args[0], args[1], args[2], args[3]);
          break;
        case 'ReplaceDocument': {
          const existing = this.documents.get(args[0]);
          if (!existing) throw new Error(`document ${args[0]} not found`);
          result = this.registerDocument(
            actingOrgMsp,
            existing.docRef,
            existing.businessRef,
            existing.docType,
            args[1],
          );
          break;
        }
        case 'CreateConsent':
          result = this.createConsent(
            actingOrgMsp,
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            args[7],
          );
          break;
        case 'RevokeConsent':
          result = this.revokeConsent(actingOrgMsp, args[0]);
          break;
        case 'IssueAttestation':
          result = this.issueAttestation(actingOrgMsp, args[0], args[1], args[2], args[3], args[4]);
          break;
        case 'UpdateAttestationStatus':
          result = this.updateAttestationStatus(actingOrgMsp, args[0], args[1], args[2]);
          break;
        case 'RecordAccessEvent':
          result = this.recordAccessEvent(actingOrgMsp, args[0], args[1], args[2], args[3], args[4]);
          break;
        case 'RecordAssessment':
          result = this.recordAssessment(actingOrgMsp, args[0], args[1], args[2], args[3], args[4]);
          break;
        default:
          throw new Error(`Unknown chaincode transaction function: ${functionName}`);
      }

      const txId = await this.recordTxMetric(functionName, 'SUCCESS', start);
      return result || txId;
    } catch (err) {
      await this.recordTxMetric(functionName, 'FAILED', start);
      throw err;
    }
  }

  async evaluateTransaction(
    actingOrgMsp: string,
    functionName: string,
    ...args: string[]
  ): Promise<string> {
    const start = Date.now();
    this.ensureHealthy();

    try {
      let result = '';
      switch (functionName) {
        case 'CheckAccess': {
          const res = await this.checkAccess(args[0], args[1], args[2], args[3]);
          result = JSON.stringify(res);
          break;
        }
        case 'GetAttestations':
          result = this.getAttestations(actingOrgMsp, args[0], args[1]);
          break;
        case 'GetHistory':
          result = JSON.stringify(this.history.get(args[0]) || []);
          break;
        case 'GetConsent':
          result = JSON.stringify(this.consents.get(args[0]) || null);
          break;
        default:
          throw new Error(`Unknown chaincode evaluate function: ${functionName}`);
      }

      await this.recordTxMetric(functionName, 'SUCCESS', start);
      return result;
    } catch (err) {
      await this.recordTxMetric(functionName, 'FAILED', start);
      throw err;
    }
  }

  async checkAccess(
    consentId: string,
    institutionId: string,
    scopeType: string,
    docRef?: string,
  ): Promise<CheckAccessResponse> {
    this.ensureHealthy();

    const consent = this.consents.get(consentId);
    if (!consent) {
      return { allowed: false, reasonCode: 'CONSENT_NOT_FOUND' };
    }

    // Check target institution active
    let inst = this.institutions.get(institutionId);
    if (!inst) {
      const instId = this.institutionByMsp.get(institutionId);
      if (instId) {
        inst = this.institutions.get(instId);
      }
    }

    if (inst && inst.status === 'SUSPENDED') {
      return { allowed: false, reasonCode: 'INSTITUTION_SUSPENDED' };
    }

    // Check institution match
    const instMatches =
      consent.institutionId === institutionId ||
      (inst && (consent.institutionId === inst.instId || consent.institutionId === inst.mspId));
    if (!instMatches) {
      return { allowed: false, reasonCode: 'INSTITUTION_MISMATCH' };
    }

    // Check consent revoked
    if (consent.status === 'REVOKED') {
      return { allowed: false, reasonCode: 'CONSENT_REVOKED' };
    }

    // Check expiry
    const now = new Date();
    const expTime = new Date(consent.expiresAt);
    if (now >= expTime) {
      return { allowed: false, reasonCode: 'CONSENT_EXPIRED' };
    }

    if (consent.status !== 'ACTIVE') {
      return { allowed: false, reasonCode: 'CONSENT_NOT_ACTIVE' };
    }

    // Scope check
    if (consent.scopeType !== scopeType) {
      return { allowed: false, reasonCode: 'SCOPE_MISMATCH' };
    }

    // Document in scope check
    if (scopeType === 'DOCUMENTS') {
      if (!docRef || !consent.docRefs.includes(docRef)) {
        return { allowed: false, reasonCode: 'DOC_NOT_IN_SCOPE' };
      }
    }

    return { allowed: true, reasonCode: 'ACCESS_ALLOWED' };
  }

  // --- Internal simulated chaincode functions matching Go logic ---

  private registerInstitution(callerMsp: string, instId: string, mspId: string, type: string): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    if (this.institutions.has(instId)) throw new Error(`institution with ID ${instId} already exists`);
    this.institutions.set(instId, { instId, mspId, type, status: 'ACTIVE' });
    this.institutionByMsp.set(mspId, instId);
    return JSON.stringify({ instId, status: 'ACTIVE' });
  }

  private setInstitutionStatus(callerMsp: string, instId: string, status: string): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    const inst = this.institutions.get(instId);
    if (!inst) throw new Error(`institution ${instId} not found`);
    inst.status = status;
    return JSON.stringify(inst);
  }

  private registerBusiness(callerMsp: string, businessRef: string): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    if (this.businesses.has(businessRef)) throw new Error(`business ${businessRef} already exists`);
    const biz = { businessRef, createdAt: new Date().toISOString() };
    this.businesses.set(businessRef, biz);
    return JSON.stringify(biz);
  }

  private registerDocument(
    callerMsp: string,
    docRef: string,
    businessRef: string,
    docType: string,
    contentHash: string,
  ): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    if (!this.businesses.has(businessRef)) throw new Error(`business ${businessRef} does not exist`);

    const existing = this.documents.get(docRef);
    let version = 1;
    if (existing) {
      if (existing.businessRef !== businessRef) {
        throw new Error(`businessRef mismatch for document ${docRef}`);
      }
      if (existing.contentHash === contentHash) {
        throw new Error(`document ${docRef} already registered with identical contentHash`);
      }
      version = existing.version + 1;
    }

    const doc: OnChainDocument = {
      docRef,
      businessRef,
      docType,
      contentHash,
      version,
      registeredAt: new Date().toISOString(),
    };
    this.documents.set(docRef, doc);
    return JSON.stringify(doc);
  }

  private createConsent(
    callerMsp: string,
    consentId: string,
    businessRef: string,
    institutionId: string,
    scopeType: string,
    docRefsJson: string,
    purposeCode: string,
    expiresAt: string,
    approvalEvidenceHash: string,
  ): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    if (this.consents.has(consentId)) throw new Error(`consent with ID ${consentId} already exists`);
    if (!this.businesses.has(businessRef)) throw new Error(`business ${businessRef} does not exist`);

    let docRefs: string[] = [];
    if (docRefsJson && docRefsJson !== '[]') {
      try {
        docRefs = JSON.parse(docRefsJson);
      } catch {
        docRefs = [];
      }
    }

    const consent: OnChainConsent = {
      consentId,
      businessRef,
      institutionId,
      scopeType,
      docRefs,
      purposeCode,
      expiresAt,
      status: 'ACTIVE',
      approvalEvidenceHash,
    };
    this.consents.set(consentId, consent);
    return JSON.stringify(consent);
  }

  private revokeConsent(callerMsp: string, consentId: string): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    const consent = this.consents.get(consentId);
    if (!consent) throw new Error(`consent ${consentId} not found`);
    if (consent.status === 'REVOKED') throw new Error(`consent ${consentId} is already revoked`);
    consent.status = 'REVOKED';
    return JSON.stringify(consent);
  }

  private issueAttestation(
    callerMsp: string,
    attId: string,
    businessRef: string,
    type: string,
    docHashSnapshotJson: string,
    validUntil: string,
  ): string {
    if (this.attestations.has(attId)) throw new Error(`attestation ${attId} already exists`);
    if (!this.businesses.has(businessRef)) throw new Error(`business ${businessRef} does not exist`);

    let snapshots: string[] = [];
    if (docHashSnapshotJson) {
      try {
        snapshots = JSON.parse(docHashSnapshotJson);
      } catch {
        snapshots = [];
      }
    }

    const att: OnChainAttestation = {
      attId,
      businessRef,
      issuerInstId: callerMsp,
      type,
      status: 'VALID',
      docHashSnapshot: snapshots,
      issuedAt: new Date().toISOString(),
      validUntil,
    };
    this.attestations.set(attId, att);
    return JSON.stringify(att);
  }

  private updateAttestationStatus(callerMsp: string, attId: string, newStatus: string, reasonCode: string): string {
    const att = this.attestations.get(attId);
    if (!att) throw new Error(`attestation ${attId} not found`);
    if (att.issuerInstId !== callerMsp) throw new Error(`caller did not issue attestation ${attId}`);
    if (att.status === 'REVOKED') throw new Error('attestation is already REVOKED (terminal state)');
    if (att.status === 'SUSPENDED' && newStatus === 'VALID') {
      throw new Error('reinstatement not permitted; issue a new attestation instead');
    }
    att.status = newStatus;
    att.reasonCode = reasonCode;
    return JSON.stringify(att);
  }

  private getAttestations(callerMsp: string, businessRef: string, consentId: string): string {
    const consent = this.consents.get(consentId);
    if (!consent || consent.status !== 'ACTIVE') throw new Error('valid ACTIVE PROFILE consent required');
    if (consent.businessRef !== businessRef) throw new Error('consent does not match business');
    if (consent.scopeType !== 'PROFILE') throw new Error('consent scope expected PROFILE');

    const results = Array.from(this.attestations.values()).filter((a) => a.businessRef === businessRef);
    return JSON.stringify(results);
  }

  private recordAccessEvent(
    callerMsp: string,
    eventId: string,
    consentId: string,
    institutionId: string,
    docRef: string,
    action: string,
  ): string {
    if (callerMsp !== 'PlatformOrgMSP') throw new Error('unauthorized: caller is not PlatformOrg');
    if (this.accessEvents.has(eventId)) throw new Error(`event ${eventId} already exists`);
    const event = { eventId, consentId, institutionId, docRef, action, at: new Date().toISOString() };
    this.accessEvents.set(eventId, event);
    return JSON.stringify(event);
  }

  private recordAssessment(
    callerMsp: string,
    assessmentId: string,
    businessRef: string,
    modelVersion: string,
    riskBand: string,
    reportHash: string,
  ): string {
    if (this.assessments.has(assessmentId)) throw new Error(`assessment ${assessmentId} already exists`);
    const assessment = {
      assessmentId,
      businessRef,
      institutionId: callerMsp,
      modelVersion,
      riskBand,
      reportHash,
      at: new Date().toISOString(),
    };
    this.assessments.set(assessmentId, assessment);
    return JSON.stringify(assessment);
  }
}

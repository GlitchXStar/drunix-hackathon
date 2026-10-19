export interface CheckAccessResponse {
  allowed: boolean;
  reasonCode: string;
}

export interface AttestationRecord {
  attId: string;
  businessRef: string;
  issuerInstId: string;
  type: string;
  status: string;
  docHashSnapshot: string[];
  issuedAt: string;
  validUntil: string;
}

export interface LedgerService {
  submitTransaction(
    actingOrgMsp: string,
    functionName: string,
    ...args: string[]
  ): Promise<string>;

  evaluateTransaction(
    actingOrgMsp: string,
    functionName: string,
    ...args: string[]
  ): Promise<string>;

  checkAccess(
    consentId: string,
    institutionId: string,
    scopeType: string,
    docRef?: string,
  ): Promise<CheckAccessResponse>;

  isHealthy(): Promise<boolean>;
}

export const LEDGER_SERVICE = 'LEDGER_SERVICE';

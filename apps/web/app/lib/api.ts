/**
 * TrustLedger API Client
 *
 * Thin wrapper over fetch() that:
 * - Prefixes all calls with /api/v1
 * - Sends & stores the CSRF token from login
 * - Includes credentials: 'include' so the HttpOnly session cookie travels
 * - Parses JSON responses and surfaces structured errors
 */

/* ---------- types -------------------------------------------------------- */

export interface ApiUser {
  id: string;
  email: string;
  role: string;
  status: string;
  institutionId?: string | null;
  institutionName?: string | null;
  institutionStatus?: string | null;
  institutionMspId?: string | null;
  businessId?: string | null;
  businessName?: string | null;
  mustChangePassword?: boolean;
}

export interface ApiError {
  code?: string;
  message: string;
  statusCode?: number;
}

export interface DocumentRecord {
  id: string;
  docRef: string;
  docType: string;
  status: string;
  mime: string;
  sizeBytes: number;
  version: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareCodeChallenge {
  shareCodeId?: string;
  challengeId: string;
  deliveryChannel?: 'SMS' | 'EMAIL' | 'DEV_OUTBOX';
  deliveryDestinationMasked?: string;
  isDevMode?: boolean;
  expiresAt?: string;
  message?: string;
}

export interface DevOtpResponse {
  code: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'LOCKED' | 'PENDING';
  expiresAt?: string;
  attemptsRemaining?: number;
  recipientMasked?: string;
  channel?: string;
  isDevMode?: boolean;
  message: string;
}

export interface ShareCodeResult {
  code: string;
  expiresAt: string;
  consentDurationMinutes?: number;
}

export interface AccessRequest {
  id: string;
  businessId: string;
  institutionId: string;
  scopeType: string;
  requestedDocTypes: string[];
  purposeCode: string;
  status: string;
  message?: string;
  createdAt: string;
}

export interface ConsentGrant {
  id: string;
  consentId: string;
  businessId: string;
  institutionId: string;
  scopeType: string;
  status: string;
  approvedDocRefs: string[];
  expiresAt: string;
  createdAt: string;
}

export interface AccessSession {
  id: string;
  consentId: string;
  status: string;
  officerUserId: string;
  activatedAt?: string;
  expiresAt?: string;
  closedAt?: string;
  createdAt: string;
}

export interface Attestation {
  id: string;
  consentId: string;
  businessRef: string;
  issuerInstitutionId: string;
  status: string;
  outcome: string;
  validUntil: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/* ---------- csrf --------------------------------------------------------- */

const CSRF_STORAGE_KEY = 'trustledger_csrf_token';
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(CSRF_STORAGE_KEY, token);
        localStorage.setItem(CSRF_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(CSRF_STORAGE_KEY);
        localStorage.removeItem(CSRF_STORAGE_KEY);
      }
    } catch {
      // Storage access may be restricted in some environments
    }
  }
}

export function getCsrfToken(): string | null {
  if (csrfToken) return csrfToken;
  if (typeof window !== 'undefined') {
    try {
      csrfToken =
        sessionStorage.getItem(CSRF_STORAGE_KEY) ||
        localStorage.getItem(CSRF_STORAGE_KEY);
    } catch {
      csrfToken = null;
    }
  }
  return csrfToken;
}

export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    }
  } catch {
    // Ignore network errors during background token fetch
  }
  return null;
}

/* ---------- core request ------------------------------------------------- */

const BASE = '/api/v1';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extra?: RequestInit,
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(extra?.headers as Record<string, string>),
  };

  const activeToken = getCsrfToken();
  if (activeToken) {
    headers['x-csrf-token'] = activeToken;
  }

  // Don't set Content-Type for FormData (browser sets boundary)
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    ...extra,
  });

  if (!res.ok) {
    let err: ApiError;
    try {
      err = await res.json();
    } catch {
      err = { message: res.statusText, statusCode: res.status };
    }

    if (res.status === 401) {
      setCsrfToken(null);
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        if (
          !currentPath.startsWith('/login') &&
          !currentPath.startsWith('/register') &&
          currentPath !== '/'
        ) {
          window.location.replace('/login?reason=session_expired');
        }
      }
    }

    // Auto-recovery: if a state-changing call fails with CSRF token missing or invalid,
    // fetch a fresh token and retry the mutation once.
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      method.toUpperCase(),
    );
    if (
      !isRetry &&
      res.status === 403 &&
      isStateChanging &&
      typeof err.message === 'string' &&
      err.message.toLowerCase().includes('csrf')
    ) {
      try {
        const freshToken = await fetchCsrfToken();
        if (freshToken) {
          setCsrfToken(freshToken);
          return await request<T>(method, path, body, extra, true);
        }
      } catch {
        // Fall through to throw original err
      }
    }

    throw { ...err, statusCode: res.status };
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  // Binary responses (document viewing)
  return res.blob() as unknown as T;
}

/* ---------- auth --------------------------------------------------------- */

export async function login(email: string, password: string): Promise<{ user: ApiUser; csrfToken: string }> {
  const result = await request<{ user: ApiUser; csrfToken: string }>('POST', '/auth/login', { email, password });
  setCsrfToken(result.csrfToken);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request<{ message: string }>('POST', '/auth/logout');
  } finally {
    setCsrfToken(null);
  }
}

let inFlightMePromise: Promise<{ user: ApiUser; csrfToken?: string }> | null = null;

export async function getMe(forceRefresh = false): Promise<{ user: ApiUser; csrfToken?: string }> {
  if (inFlightMePromise && !forceRefresh) {
    return inFlightMePromise;
  }
  inFlightMePromise = request<{ user: ApiUser; csrfToken?: string }>('GET', '/auth/me')
    .then((result) => {
      if (result.csrfToken) {
        setCsrfToken(result.csrfToken);
      }
      return result;
    })
    .finally(() => {
      inFlightMePromise = null;
    });
  return inFlightMePromise;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ csrfToken: string }> {
  const result = await request<{ message: string; csrfToken: string }>('POST', '/auth/change-password', { oldPassword, newPassword });
  setCsrfToken(result.csrfToken);
  return result;
}

/* ---------- business registration ---------------------------------------- */

export async function registerBusiness(data: {
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  legalName: string;
  gstin?: string;
  businessType?: string;
}): Promise<{ user: ApiUser; csrfToken: string }> {
  const result = await request<{ user: ApiUser; csrfToken: string }>('POST', '/business/register', data);
  setCsrfToken(result.csrfToken);
  return result;
}

/* ---------- business profile --------------------------------------------- */

export async function getBusinessProfile(): Promise<any> {
  return request('GET', '/business/me');
}

export async function updateBusinessProfile(data: any): Promise<any> {
  return request('PATCH', '/business/me', data);
}

/* ---------- documents ---------------------------------------------------- */

export async function listDocuments(): Promise<DocumentRecord[]> {
  return request<DocumentRecord[]>('GET', '/business/documents');
}

export async function uploadDocument(file: File, docType: string): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('docType', docType);
  return request<DocumentRecord>('POST', '/business/documents', formData);
}

export async function retryDocRegistration(id: string): Promise<DocumentRecord> {
  return request<DocumentRecord>('POST', `/business/documents/${id}/retry-registration`);
}

export async function viewOwnDocument(id: string): Promise<Blob> {
  return request<Blob>('GET', `/business/documents/${id}/view`);
}

export async function replaceDocument(id: string, file: File): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('file', file);
  return request<DocumentRecord>('PUT', `/business/documents/${id}`, formData);
}

export async function deleteDocument(id: string): Promise<void> {
  return request<void>('DELETE', `/business/documents/${id}`);
}

/* ---------- share codes -------------------------------------------------- */

export async function createShareCode(durationMinutes: number): Promise<ShareCodeChallenge> {
  return request<ShareCodeChallenge>('POST', '/business/share-codes', { durationMinutes });
}

export async function confirmShareCode(challengeId: string, otpCode: string): Promise<ShareCodeResult> {
  return request<ShareCodeResult>('POST', `/business/share-codes/${challengeId}/confirm`, { otpCode });
}

export async function getDevOtpForShareCode(shareCodeId: string): Promise<DevOtpResponse> {
  return request<DevOtpResponse>('GET', `/business/share-codes/${shareCodeId}/dev-otp`);
}

export async function resendShareCodeOtp(shareCodeId: string): Promise<ShareCodeChallenge> {
  return request<ShareCodeChallenge>('POST', `/business/share-codes/${shareCodeId}/resend`);
}

/* ---------- business requests -------------------------------------------- */

export async function listBusinessRequests(): Promise<AccessRequest[]> {
  return request<AccessRequest[]>('GET', '/business/requests');
}

export async function getBusinessRequest(id: string): Promise<AccessRequest> {
  return request<AccessRequest>('GET', `/business/requests/${id}`);
}

export interface RequestApprovalChallenge {
  requestId?: string;
  challengeId: string;
  deliveryChannel?: 'SMS' | 'EMAIL' | 'DEV_OUTBOX';
  deliveryDestinationMasked?: string;
  isDevMode?: boolean;
  expiresAt?: string;
  message?: string;
}

export async function issueApprovalOtp(requestId: string): Promise<RequestApprovalChallenge> {
  return request<RequestApprovalChallenge>('POST', `/business/requests/${requestId}/otp`);
}

export async function getDevOtpForRequest(requestId: string): Promise<DevOtpResponse> {
  return request<DevOtpResponse>('GET', `/business/requests/${requestId}/dev-otp`);
}

export async function decideRequest(
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
  otpCode?: string,
  approvedDocRefs?: string[],
  durationMinutes?: number,
  allowDownload?: boolean,
  approvedDocTypes?: string[],
): Promise<any> {
  return request('POST', `/business/requests/${requestId}/decision`, {
    decision,
    otpCode,
    approvedDocRefs,
    durationMinutes,
    allowDownload,
    approvedDocTypes,
  });
}

/* ---------- business consents -------------------------------------------- */

export async function listBusinessConsents(): Promise<ConsentGrant[]> {
  return request<ConsentGrant[]>('GET', '/business/consents');
}

export async function revokeConsent(consentId: string): Promise<void> {
  return request<void>('POST', `/business/consents/${consentId}/revoke`);
}

/* ---------- business attestations ---------------------------------------- */

export async function listBusinessAttestations(): Promise<Attestation[]> {
  return request<Attestation[]>('GET', '/business/attestations');
}

/* ---------- institution: profile lookup ---------------------------------- */

export async function redeemShareCode(code: string): Promise<{ legalName: string; consentId: string; businessRef: string }> {
  return request('POST', '/institution/profile-lookup', { code });
}

/* ---------- institution: requests ---------------------------------------- */

export async function createInstitutionRequest(data: {
  businessId: string;
  scopeType: 'DOCUMENTS' | 'FEATURES';
  requestedDocTypes?: string[];
  purposeCode: string;
  requestedDurationMinutes?: number;
  allowDownload?: boolean;
  message?: string;
}): Promise<AccessRequest> {
  return request<AccessRequest>('POST', '/institution/requests', data);
}

export async function listInstitutionRequests(): Promise<AccessRequest[]> {
  return request<AccessRequest[]>('GET', '/institution/requests');
}

export async function cancelInstitutionRequest(id: string): Promise<void> {
  return request<void>('POST', `/institution/requests/${id}/cancel`);
}

/* ---------- institution: consents ---------------------------------------- */

export async function listInstitutionConsents(): Promise<ConsentGrant[]> {
  return request<ConsentGrant[]>('GET', '/institution/consents');
}

/* ---------- institution: sessions ---------------------------------------- */

export async function createAccessSession(consentId: string, requestedDurationMinutes?: number): Promise<AccessSession> {
  return request<AccessSession>('POST', '/institution/sessions', { consentId, requestedDurationMinutes });
}

export async function activateSession(sessionId: string, otpCode: string): Promise<AccessSession> {
  return request<AccessSession>('POST', `/institution/sessions/${sessionId}/activate`, { otpCode });
}

export async function getDevOtpForSession(sessionId: string): Promise<DevOtpResponse> {
  return request<DevOtpResponse>('GET', `/institution/sessions/${sessionId}/dev-otp`);
}

export async function closeSession(sessionId: string): Promise<void> {
  return request<void>('POST', `/institution/sessions/${sessionId}/close`);
}

export async function getSessionDocuments(sessionId: string): Promise<DocumentRecord[]> {
  return request<DocumentRecord[]>('GET', `/institution/sessions/${sessionId}/documents`);
}

export async function viewDocumentPage(sessionId: string, docRef: string, page: number): Promise<Blob> {
  return request<Blob>('GET', `/institution/sessions/${sessionId}/documents/${docRef}/pages/${page}`);
}

export async function downloadSessionDocument(sessionId: string, docRef: string): Promise<Blob> {
  return request<Blob>('GET', `/institution/sessions/${sessionId}/documents/${docRef}/download`);
}

/* ---------- institution: KYC reviews ------------------------------------- */

export async function createKycReview(data: {
  consentId: string;
  accessSessionId: string;
  docRefsReviewed: string[];
  checklist: Record<string, boolean | string | number>;
  outcome: string;
  notes: string;
}): Promise<any> {
  return request('POST', '/institution/kyc-reviews', data);
}

/* ---------- institution: attestations ------------------------------------ */

export async function issueAttestation(data: {
  kycReviewId: string;
  validityMonths?: number;
  type?: string;
}): Promise<Attestation> {
  return request<Attestation>('POST', '/institution/attestations', data);
}

export async function updateAttestationStatus(
  attestationId: string,
  status: 'SUSPENDED' | 'REVOKED',
  reasonCode: string,
): Promise<any> {
  return request('PATCH', `/institution/attestations/${attestationId}/status`, { status, reasonCode });
}

export async function lookupAttestations(consentId: string): Promise<any[]> {
  return request<any[]>('GET', `/institution/consents/${consentId}/attestations`);
}

/* ---------- notifications ------------------------------------------------ */

export async function listNotifications(): Promise<Notification[]> {
  return request<Notification[]>('GET', '/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  return request<void>('POST', `/notifications/${id}/read`);
}

/* ---------- dev outbox --------------------------------------------------- */

export async function getDevOutbox(): Promise<any[]> {
  return request<any[]>('GET', '/dev/outbox');
}

/* ---------- admin -------------------------------------------------------- */

export async function getAdminOverview(): Promise<any> {
  return request('GET', '/admin/overview');
}

export async function listInstitutions(): Promise<any[]> {
  return request<any[]>('GET', '/admin/institutions');
}

export async function createInstitution(data: any): Promise<any> {
  return request('POST', '/admin/institutions', data);
}

export async function updateInstitutionStatus(id: string, status: string): Promise<any> {
  return request('PATCH', `/admin/institutions/${id}/status`, { status });
}

export async function listAuditEvents(scope?: string): Promise<any[]> {
  const qs = scope ? `?scope=${scope}` : '';
  return request<any[]>('GET', `/admin/audit${qs}`);
}

/* ---------- business: access history ------------------------------------- */

export async function listAccessHistory(): Promise<any[]> {
  return request<any[]>('GET', '/business/access-history');
}

/* ---------- ledger explorer & observability ------------------------------ */

export interface LedgerNetworkStatus {
  provider: string;
  ledgerType: string;
  isSimulated: boolean;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  channelId: string;
  chaincodeId: string;
  totalTransactions: number;
  lastTxId: string | null;
  lastTxAt: string | null;
  peers: Array<{
    mspId: string;
    name: string;
    role: string;
    status: string;
  }>;
  consensusModel: string;
}

export interface LedgerTxRecord {
  id: string;
  txId: string;
  mspId: string;
  chaincodeFunction: string;
  status: string;
  latencyMs: number;
  at: string;
}

export async function getLedgerStatus(): Promise<LedgerNetworkStatus> {
  return request<LedgerNetworkStatus>('GET', '/ledger/status');
}

export async function listLedgerTransactions(limit = 50): Promise<LedgerTxRecord[]> {
  return request<LedgerTxRecord[]>('GET', `/ledger/transactions?limit=${limit}`);
}

export async function getLedgerTransaction(txId: string): Promise<any> {
  return request('GET', `/ledger/transactions/${txId}`);
}


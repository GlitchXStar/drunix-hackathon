import { UserRole, UserStatus, InstitutionStatus } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  institutionId?: string | null;
  institutionName?: string | null;
  institutionStatus?: InstitutionStatus | null;
  institutionMspId?: string | null;
  businessId?: string | null;
  businessName?: string | null;
  mustChangePassword?: boolean;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  csrfTokenHash: string;
}

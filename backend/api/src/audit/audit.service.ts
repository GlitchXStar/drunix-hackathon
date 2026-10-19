import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface AuditRecordParams {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  institutionId?: string | null;
  businessId?: string | null;
  metadata?: Record<string, unknown> | null;
  ledgerTxId?: string | null;
}

const REDACTED_KEY_PATTERNS = [
  /password/i,
  /code/i,
  /secret/i,
  /token/i,
  /key/i,
  /otp/i,
  /dek/i,
  /salt/i,
  /credential/i,
  /authorization/i,
];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deep sanitize an object to strip secrets, keys, OTP values, and tokens
   */
  public sanitizeMetadata(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeMetadata(item));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitiveKey = REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Record an audit event
   */
  async record(params: AuditRecordParams): Promise<void> {
    const cleanMetadata = this.sanitizeMetadata(params.metadata || {});
    const metadataString = JSON.stringify(cleanMetadata);

    try {
      await this.prisma.auditEvent.create({
        data: {
          actor: params.actor,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          institutionId: params.institutionId || null,
          businessId: params.businessId || null,
          metadata: metadataString,
          ledgerTxId: params.ledgerTxId || null,
          at: new Date(),
        },
      });
    } catch (err) {
      // In tests/mocked scenarios or disconnect, log without crashing critical path
      this.logger.warn(`Failed to write audit event: ${(err as Error).message}`);
    }
  }
}

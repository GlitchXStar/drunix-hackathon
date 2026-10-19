import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma.service';

describe('Security Test S-16: Log and Audit Redaction Verification', () => {
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            auditEvent: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    auditService = module.get<AuditService>(AuditService);
  });

  it('S-16: Audit metadata must redact passwords, OTPs, secret keys, tokens, and DEKs', () => {
    const sensitivePayload = {
      userEmail: 'business@example.com',
      requestId: 'req-12345',
      userPassword: 'SuperSecretPassword123!',
      password: 'PlainPassword12',
      otpCode: '839201',
      otp: '123456',
      secretKey: 'aes-key-bytes-hex',
      wrappedDek: 'wrapped-data-encryption-key',
      authTag: 'tag-123',
      salt: 'random-salt-string',
      apiToken: 'jwt.token.string',
      csrfToken: 'csrf-secret-value',
      authorizationHeader: 'Bearer xyz123456',
      nested: {
        deeperSecret: 'nested-secret-value',
        otp_challenge: 'code-in-nested',
        publicNote: 'This note is safe',
      },
      safeArray: ['item1', 'item2'],
    };

    const sanitized = auditService.sanitizeMetadata(sensitivePayload) as Record<string, any>;
    const serialized = JSON.stringify(sanitized);

    // Verify all sensitive terms are redacted
    expect(sanitized.userPassword).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.otpCode).toBe('[REDACTED]');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.secretKey).toBe('[REDACTED]');
    expect(sanitized.wrappedDek).toBe('[REDACTED]');
    expect(sanitized.salt).toBe('[REDACTED]');
    expect(sanitized.apiToken).toBe('[REDACTED]');
    expect(sanitized.csrfToken).toBe('[REDACTED]');
    expect(sanitized.authorizationHeader).toBe('[REDACTED]');
    expect(sanitized.nested.deeperSecret).toBe('[REDACTED]');
    expect(sanitized.nested.otp_challenge).toBe('[REDACTED]');

    // Verify safe properties are preserved
    expect(sanitized.userEmail).toBe('business@example.com');
    expect(sanitized.requestId).toBe('req-12345');
    expect(sanitized.nested.publicNote).toBe('This note is safe');
    expect(sanitized.safeArray).toEqual(['item1', 'item2']);

    // Complete string scan: zero plaintext passwords, keys, or OTPs in serialized JSON
    expect(serialized).not.toContain('SuperSecretPassword123!');
    expect(serialized).not.toContain('PlainPassword12');
    expect(serialized).not.toContain('839201');
    expect(serialized).not.toContain('aes-key-bytes-hex');
    expect(serialized).not.toContain('wrapped-data-encryption-key');
    expect(serialized).not.toContain('csrf-secret-value');
    expect(serialized).not.toContain('nested-secret-value');
  });
});

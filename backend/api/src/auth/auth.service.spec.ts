import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole, UserStatus, InstitutionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let audit: any;

  const mockPassword = 'SecurePassword123!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(mockPassword, { type: argon2.argon2id });
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      institution: {
        findUnique: jest.fn(),
      },
      serverSession: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    audit = {
      record: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login & lockout rules', () => {
    it('should authenticate user with valid credentials and return session', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'officer@banka.example.com',
        role: UserRole.KYC_OFFICER,
        status: UserStatus.ACTIVE,
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        institutionId: 'inst-1',
        mustChangePassword: false,
      });

      prisma.institution.findUnique.mockResolvedValue({
        id: 'inst-1',
        status: InstitutionStatus.ACTIVE,
        mspId: 'BankAOrgMSP',
      });

      prisma.serverSession.create.mockResolvedValue({});

      const result = await service.login(
        { email: 'officer@banka.example.com', password: mockPassword },
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('csrfToken');
      expect(result.user.email).toBe('officer@banka.example.com');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_SUCCESS' }),
      );
    });

    it('should return generic error and increment failedLoginCount on wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'officer@banka.example.com',
        role: UserRole.KYC_OFFICER,
        status: UserStatus.ACTIVE,
        passwordHash,
        failedLoginCount: 1,
        lockedUntil: null,
      });

      await expect(
        service.login(
          { email: 'officer@banka.example.com', password: 'WrongPassword999!' },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ failedLoginCount: 2 }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' }),
      );
    });

    it('should lock account for 15 minutes after 5 consecutive failed logins', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'officer@banka.example.com',
        role: UserRole.KYC_OFFICER,
        status: UserStatus.ACTIVE,
        passwordHash,
        failedLoginCount: 4, // 5th attempt
        lockedUntil: null,
      });

      await expect(
        service.login(
          { email: 'officer@banka.example.com', password: 'WrongPassword999!' },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            failedLoginCount: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOCKOUT' }),
      );
    });

    it('should reject login immediately if account is currently locked', async () => {
      const futureLock = new Date(Date.now() + 10 * 60 * 1000); // Locked for 10 more minutes
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'officer@banka.example.com',
        lockedUntil: futureLock,
      });

      await expect(
        service.login(
          { email: 'officer@banka.example.com', password: mockPassword },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject login with generic message if user does not exist (no email leak)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'nonexistent@example.com', password: mockPassword },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_FAILED',
          metadata: expect.objectContaining({ reason: 'USER_NOT_FOUND' }),
        }),
      );
    });

    it('should reject login if institution is suspended (I-5)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'officer@banka.example.com',
        role: UserRole.KYC_OFFICER,
        status: UserStatus.ACTIVE,
        passwordHash,
        failedLoginCount: 0,
        institutionId: 'inst-suspended',
      });

      prisma.institution.findUnique.mockResolvedValue({
        id: 'inst-suspended',
        status: InstitutionStatus.SUSPENDED,
      });

      await expect(
        service.login(
          { email: 'officer@banka.example.com', password: mockPassword },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('password change & session rotation', () => {
    it('should rotate session and update password when valid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
      });
      prisma.user.update.mockResolvedValue({});
      prisma.serverSession.updateMany.mockResolvedValue({});
      prisma.serverSession.create.mockResolvedValue({});

      const result = await service.changePassword(
        'user-1',
        'old-session-123',
        { oldPassword: mockPassword, newPassword: 'NewBrandNewPassword2026!' },
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('newSessionId');
      expect(result).toHaveProperty('newCsrfToken');
      // Revoked previous session
      expect(prisma.serverSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'old-session-123' },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('should reject password change if new password is under 12 characters', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
      });

      await expect(
        service.changePassword(
          'user-1',
          'old-session-123',
          { oldPassword: mockPassword, newPassword: 'ShortPass1!' },
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

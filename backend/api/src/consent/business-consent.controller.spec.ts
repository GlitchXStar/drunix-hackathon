import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessConsentController } from './business-consent.controller';
import { ShareCodeService } from './share-code.service';
import { RequestsService } from './requests.service';
import { ConsentService } from './consent.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, UserStatus } from '@prisma/client';
import { SESSION_COOKIE_NAME } from '../auth/session.guard';

describe('BusinessConsentController', () => {
  let controller: BusinessConsentController;
  let prisma: any;
  let authService: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      business: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    authService = {
      createSession: jest.fn().mockResolvedValue({
        sessionId: 'test-session-id',
        csrfToken: 'test-csrf-token',
      }),
    };

    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const shareCodeService = {
      createShareCodeChallenge: jest.fn(),
      confirmShareCode: jest.fn(),
      getDevOtpForShareCode: jest.fn(),
      resendShareCodeOtp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessConsentController],
      providers: [
        { provide: ShareCodeService, useValue: shareCodeService },
        { provide: RequestsService, useValue: {} },
        { provide: ConsentService, useValue: {} },
        { provide: IdempotencyService, useValue: { execute: jest.fn() } },
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    controller = module.get<BusinessConsentController>(BusinessConsentController);
  });

  describe('register', () => {
    const registerDto = {
      ownerName: 'Gaurav',
      email: 'gaurav@example.com',
      phone: '+919422124928',
      password: 'StrongPassword123!',
      legalName: 'VIT, Pune',
      gstin: '27AAACA1234A1Z5',
      businessType: 'Services',
    };

    const mockReq: any = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Jest' },
    };

    const mockRes: any = {
      cookie: jest.fn(),
    };

    it('should successfully register a business and owner, set cookie, and return user profile', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'gaurav@example.com',
        phone: '+919422124928',
        role: UserRole.BUSINESS_OWNER,
        status: UserStatus.ACTIVE,
      });
      prisma.business.create.mockResolvedValue({
        id: 'new-biz-id',
        businessRef: 'test-biz-ref',
        legalName: 'VIT, Pune',
      });
      prisma.user.update.mockResolvedValue({
        id: 'new-user-id',
        businessId: 'new-biz-id',
      });

      const result = await controller.register(registerDto, mockReq, mockRes);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'gaurav@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.business.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'new-user-id' },
        data: { businessId: 'new-biz-id' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_REGISTER_SUCCESS',
          entityType: 'User',
          entityId: 'new-user-id',
          businessId: 'new-biz-id',
        }),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'test-session-id',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
      expect(result).toEqual({
        user: {
          id: 'new-user-id',
          email: 'gaurav@example.com',
          role: UserRole.BUSINESS_OWNER,
          status: UserStatus.ACTIVE,
          institutionId: null,
          institutionName: null,
          institutionStatus: null,
          institutionMspId: null,
          businessId: 'new-biz-id',
          businessName: 'VIT, Pune',
          mustChangePassword: false,
        },
        csrfToken: 'test-csrf-token',
      });
    });

    it('should throw ConflictException if email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(controller.register(registerDto, mockReq, mockRes)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getBusinessProfile', () => {
    it('should return business profile if found', async () => {
      prisma.business.findUnique.mockResolvedValue({
        id: 'biz-1',
        businessRef: 'ref-1',
        legalName: 'VIT, Pune',
        identifiers: JSON.stringify({ gstin: '27AAACA1234A1Z5', businessType: 'Services' }),
        contact: JSON.stringify({ ownerName: 'Gaurav', phone: '+919422124928' }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const user: any = {
        id: 'user-1',
        businessId: 'biz-1',
        role: UserRole.BUSINESS_OWNER,
      };

      const result = await controller.getBusinessProfile({ user });
      expect(result.id).toBe('biz-1');
      expect(result.legalName).toBe('VIT, Pune');
      expect(result.gstin).toBe('27AAACA1234A1Z5');
      expect(result.ownerName).toBe('Gaurav');
    });

    it('should throw NotFoundException if business not found', async () => {
      prisma.business.findUnique.mockResolvedValue(null);

      const user: any = {
        id: 'user-1',
        businessId: 'biz-nonexistent',
        role: UserRole.BUSINESS_OWNER,
      };

      await expect(controller.getBusinessProfile({ user })).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateBusinessProfile', () => {
    it('should update business profile', async () => {
      prisma.business.findUnique.mockResolvedValue({
        id: 'biz-1',
        businessRef: 'ref-1',
        legalName: 'VIT, Pune',
        identifiers: JSON.stringify({ gstin: 'OLD_GSTIN' }),
        contact: JSON.stringify({ phone: 'OLD_PHONE' }),
      });

      prisma.business.update.mockResolvedValue({
        id: 'biz-1',
        businessRef: 'ref-1',
        legalName: 'VIT, Pune Updated',
        updatedAt: new Date(),
      });

      const user: any = {
        id: 'user-1',
        businessId: 'biz-1',
        role: UserRole.BUSINESS_OWNER,
      };

      const result = await controller.updateBusinessProfile(
        { user },
        { legalName: 'VIT, Pune Updated', gstin: 'NEW_GSTIN' },
      );

      expect(prisma.business.update).toHaveBeenCalled();
      expect(result.legalName).toBe('VIT, Pune Updated');
      expect(result.gstin).toBe('NEW_GSTIN');
    });
  });

  describe('share-codes endpoints', () => {
    const user: any = {
      id: 'owner-1',
      businessId: 'biz-1',
      role: UserRole.BUSINESS_OWNER,
    };

    it('should create share code challenge', async () => {
      const shareCodeService = (controller as any).shareCodeService;
      shareCodeService.createShareCodeChallenge.mockResolvedValue({
        shareCodeId: 'sc-1',
        challengeId: 'ch-1',
        deliveryChannel: 'DEV_OUTBOX',
        deliveryDestinationMasked: '******3210',
        isDevMode: true,
      });

      const res = await controller.createShareCode({ user }, { durationMinutes: 60 });
      expect(res.shareCodeId).toBe('sc-1');
      expect(shareCodeService.createShareCodeChallenge).toHaveBeenCalledWith('biz-1', 'owner-1', 60);
    });

    it('should confirm share code with OTP', async () => {
      const shareCodeService = (controller as any).shareCodeService;
      shareCodeService.confirmShareCode.mockResolvedValue({
        code: '23456789',
        shareCodeId: 'sc-1',
        expiresAt: new Date().toISOString(),
      });

      const res = await controller.confirmShareCode({ user }, 'sc-1', { otpCode: '123456' });
      expect(res.code).toBe('23456789');
      expect(shareCodeService.confirmShareCode).toHaveBeenCalledWith('biz-1', 'owner-1', 'sc-1', '123456');
    });

    it('should retrieve development OTP', async () => {
      const shareCodeService = (controller as any).shareCodeService;
      shareCodeService.getDevOtpForShareCode.mockResolvedValue({
        code: '123456',
        status: 'ACTIVE',
        isDevMode: true,
      });

      const res = await controller.getDevOtp({ user }, 'sc-1');
      expect(res.code).toBe('123456');
      expect(shareCodeService.getDevOtpForShareCode).toHaveBeenCalledWith('biz-1', 'owner-1', 'sc-1');
    });

    it('should resend share-code OTP', async () => {
      const shareCodeService = (controller as any).shareCodeService;
      shareCodeService.resendShareCodeOtp.mockResolvedValue({
        shareCodeId: 'sc-1',
        challengeId: 'ch-2',
        isDevMode: true,
      });

      const res = await controller.resendShareCodeOtp({ user }, 'sc-1');
      expect(res.challengeId).toBe('ch-2');
      expect(shareCodeService.resendShareCodeOtp).toHaveBeenCalledWith('biz-1', 'owner-1', 'sc-1');
    });
  });
});

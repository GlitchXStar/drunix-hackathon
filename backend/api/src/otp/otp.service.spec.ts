import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { OTP_DELIVERY_PROVIDER } from './otp.interface';

describe('OtpService', () => {
  let service: OtpService;
  let prisma: any;
  let audit: any;
  let delivery: any;

  beforeEach(async () => {
    prisma = {
      otpChallenge: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    audit = {
      record: jest.fn(),
    };

    delivery = {
      deliver: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OTP_DELIVERY_PROVIDER, useValue: delivery },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-pepper-12345'),
          },
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('createChallenge rules', () => {
    it('should generate 6-digit CSPRNG code, hash with pepper, and deliver', async () => {
      prisma.otpChallenge.findMany.mockResolvedValue([]);
      prisma.otpChallenge.updateMany.mockResolvedValue({});
      prisma.otpChallenge.create.mockImplementation((args: any) => ({
        id: args.data.id,
        ...args.data,
      }));

      const result = await service.createChallenge({
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-owner-1',
        boundEntityId: 'req-uuid-1',
        recipientContact: '+919876543210',
      });

      expect(result).toHaveProperty('challengeId');
      expect(delivery.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+919876543210',
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          code: expect.stringMatching(/^\d{6}$/),
          challengeId: result.challengeId,
        }),
      );
      expect(prisma.otpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempts: 0,
            expiresAt: expect.any(Date),
          }),
        }),
      );
      // Invalidate earlier active challenges
      expect(prisma.otpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subjectUserId: 'user-owner-1',
            boundEntityId: 'req-uuid-1',
            consumedAt: null,
          }),
        }),
      );
    });

    it('should reject resend request within 30 seconds', async () => {
      const recent = new Date(Date.now() - 15 * 1000); // 15 seconds ago
      prisma.otpChallenge.findMany.mockResolvedValue([
        { id: 'recent-1', createdAt: recent },
      ]);

      await expect(
        service.createChallenge({
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-owner-1',
          boundEntityId: 'req-uuid-1',
          recipientContact: '+919876543210',
        }),
      ).rejects.toThrow('Please wait 30 seconds before requesting a new OTP');
    });

    it('should reject more than 3 requests within 10 minutes', async () => {
      const t1 = new Date(Date.now() - 60 * 1000);
      const t2 = new Date(Date.now() - 120 * 1000);
      const t3 = new Date(Date.now() - 180 * 1000);
      prisma.otpChallenge.findMany.mockResolvedValue([
        { id: '1', createdAt: t1 },
        { id: '2', createdAt: t2 },
        { id: '3', createdAt: t3 },
      ]);

      await expect(
        service.createChallenge({
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-owner-1',
          boundEntityId: 'req-uuid-1',
          recipientContact: '+919876543210',
        }),
      ).rejects.toThrow('Maximum 3 OTP requests allowed per 10 minutes');
    });
  });

  describe('verifyOtp rules (single use, binding, attempts, expiry)', () => {
    it('should verify matching code and mark consumed', async () => {
      const challengeId = 'chall-1';
      const rawCode = '123456';
      const codeHash = service.computeHash(challengeId, rawCode);

      prisma.otpChallenge.findUnique.mockResolvedValue({
        id: challengeId,
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-1',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000), // 3 mins future
        consumedAt: null,
      });

      const verified = await service.verifyOtp({
        challengeId,
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-1',
        code: rawCode,
      });

      expect(verified).toBe(true);
      expect(prisma.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: challengeId },
          data: { consumedAt: expect.any(Date) },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OTP_VERIFIED' }),
      );
    });

    it('should reject already consumed OTP (single-use rule)', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'chall-1',
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-1',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      });

      await expect(
        service.verifyOtp({
          challengeId: 'chall-1',
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-1',
          boundEntityId: 'req-1',
          code: '123456',
        }),
      ).rejects.toThrow('OTP has already been used');
    });

    it('should reject expired OTP (5-minute expiry rule)', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'chall-1',
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-1',
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000), // Expired 1s ago
      });

      await expect(
        service.verifyOtp({
          challengeId: 'chall-1',
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-1',
          boundEntityId: 'req-1',
          code: '123456',
        }),
      ).rejects.toThrow('OTP has expired');
    });

    it('should reject OTP for mismatched boundEntityId or purpose (binding rule)', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'chall-1',
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-entity-A',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      });

      // Wrong bound entity
      await expect(
        service.verifyOtp({
          challengeId: 'chall-1',
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-1',
          boundEntityId: 'req-entity-B', // Different entity!
          code: '123456',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Wrong purpose
      await expect(
        service.verifyOtp({
          challengeId: 'chall-1',
          purpose: OtpPurpose.SESSION_ACTIVATION, // Wrong purpose!
          subjectUserId: 'user-1',
          boundEntityId: 'req-entity-A',
          code: '123456',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject and lock after 5 failed attempts (attempt limit rule)', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'chall-1',
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: 'user-1',
        boundEntityId: 'req-1',
        attempts: 5, // Already 5 attempts!
        consumedAt: null,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      });

      await expect(
        service.verifyOtp({
          challengeId: 'chall-1',
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: 'user-1',
          boundEntityId: 'req-1',
          code: '123456',
        }),
      ).rejects.toThrow('Maximum OTP verification attempts exceeded');
    });
  });
});

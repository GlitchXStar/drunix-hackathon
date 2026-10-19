import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus, InstitutionStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { SessionGuard, SESSION_COOKIE_NAME } from './session.guard';

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let reflector: Reflector;
  let prisma: any;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      serverSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      institution: {
        findUnique: jest.fn(),
      },
    };
    guard = new SessionGuard(reflector, prisma);
  });

  function createMockContext(
    method: string,
    cookies: Record<string, string> = {},
    headers: Record<string, string> = {},
    isPublic = false,
  ): ExecutionContext {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);

    const request = {
      method,
      cookies,
      headers,
      user: null as any,
      session: null as any,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('should allow public routes without session cookie', async () => {
    const context = createMockContext('GET', {}, {}, true);
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should reject requests without session cookie', async () => {
    const context = createMockContext('GET', {});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject expired session by idle timeout (30m)', async () => {
    const pastIdle = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
    const futureAbsolute = new Date(Date.now() + 4 * 60 * 60 * 1000);

    prisma.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'sess-uuid-1',
      userId: 'user-1',
      idleExpiresAt: pastIdle,
      absoluteExpiresAt: futureAbsolute,
      revokedAt: null,
    });

    const context = createMockContext('GET', { [SESSION_COOKIE_NAME]: 'sess-uuid-1' });
    await expect(guard.canActivate(context)).rejects.toThrow('Session idle timeout exceeded');
    expect(prisma.serverSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('should reject expired session by absolute lifetime (8h)', async () => {
    const futureIdle = new Date(Date.now() + 20 * 60 * 1000);
    const pastAbsolute = new Date(Date.now() - 10 * 60 * 1000); // Expired

    prisma.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'sess-uuid-1',
      userId: 'user-1',
      idleExpiresAt: futureIdle,
      absoluteExpiresAt: pastAbsolute,
      revokedAt: null,
    });

    const context = createMockContext('GET', { [SESSION_COOKIE_NAME]: 'sess-uuid-1' });
    await expect(guard.canActivate(context)).rejects.toThrow('Session absolute lifetime exceeded');
  });

  it('should reject session immediately if institution is suspended (I-5)', async () => {
    const futureIdle = new Date(Date.now() + 20 * 60 * 1000);
    const futureAbsolute = new Date(Date.now() + 4 * 60 * 60 * 1000);

    prisma.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'sess-uuid-1',
      userId: 'user-1',
      idleExpiresAt: futureIdle,
      absoluteExpiresAt: futureAbsolute,
      revokedAt: null,
    });

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
      institutionId: 'inst-suspended',
    });

    prisma.institution.findUnique.mockResolvedValue({
      id: 'inst-suspended',
      status: InstitutionStatus.SUSPENDED,
    });

    const context = createMockContext('GET', { [SESSION_COOKIE_NAME]: 'sess-uuid-1' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should enforce CSRF token validation on state-changing POST requests', async () => {
    const futureIdle = new Date(Date.now() + 20 * 60 * 1000);
    const futureAbsolute = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const validCsrf = 'correct-csrf-token-12345';
    const csrfHash = crypto.createHash('sha256').update(validCsrf).digest('hex');

    prisma.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'sess-uuid-1',
      userId: 'user-1',
      idleExpiresAt: futureIdle,
      absoluteExpiresAt: futureAbsolute,
      csrfTokenHash: csrfHash,
      revokedAt: null,
    });

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
      role: UserRole.BUSINESS_OWNER,
    });

    // 1. Missing CSRF header -> rejected
    const contextNoCsrf = createMockContext('POST', { [SESSION_COOKIE_NAME]: 'sess-uuid-1' }, {});
    await expect(guard.canActivate(contextNoCsrf)).rejects.toThrow('CSRF token missing or invalid');

    // 2. Wrong CSRF token -> rejected
    const contextWrongCsrf = createMockContext(
      'POST',
      { [SESSION_COOKIE_NAME]: 'sess-uuid-1' },
      { 'x-csrf-token': 'wrong-token' },
    );
    await expect(guard.canActivate(contextWrongCsrf)).rejects.toThrow('Invalid CSRF token');

    // 3. Correct CSRF token -> allowed
    const contextValid = createMockContext(
      'POST',
      { [SESSION_COOKIE_NAME]: 'sess-uuid-1' },
      { 'x-csrf-token': validCsrf },
    );
    const result = await guard.canActivate(contextValid);
    expect(result).toBe(true);
  });
});

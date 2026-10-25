import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UserRole, UserStatus, InstitutionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Auth & Session Flow (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;
  const testPassword = 'Password123456!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
  });

  beforeEach(async () => {
    process.env.DEV_OUTBOX = '1';

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      business: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      institution: {
        findUnique: jest.fn(),
      },
      serverSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
      devOutbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'out-1', channel: 'SMS/EMAIL', recipient: '+919999999999', body: 'TrustLedger OTP: 123456' },
        ]),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/login -> logs in successfully and returns cookie + csrfToken', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'admin@banka.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      institutionId: 'inst-1',
    });

    prismaMock.institution.findUnique.mockResolvedValue({
      id: 'inst-1',
      status: InstitutionStatus.ACTIVE,
      mspId: 'BankAOrgMSP',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@banka.example.com', password: testPassword })
      .expect(200);

    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookieHeader = res.headers['set-cookie'][0];
    expect(cookieHeader).toContain('trustledger_session=');
  });

  it('POST /api/v1/auth/login -> rejects wrong password with 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'admin@banka.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@banka.example.com', password: 'WrongPassword999!' })
      .expect(401);

    expect(res.body.message).toContain('Invalid email or password');
  });

  it('GET /api/v1/dev/outbox -> returns outbox messages when DEV_OUTBOX=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dev/outbox')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].body).toContain('TrustLedger OTP: 123456');
  });

  it('POST /api/v1/business/register -> successfully registers MSME and owner, sets session cookie', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'new-owner-id',
      email: 'owner@newbiz.example.com',
      phone: '+919422124928',
      role: UserRole.BUSINESS_OWNER,
      status: UserStatus.ACTIVE,
    });
    prismaMock.business.create.mockResolvedValue({
      id: 'new-biz-id',
      businessRef: 'ref-uuid-1234',
      legalName: 'VIT, Pune',
      identifiers: JSON.stringify({ gstin: '27AAACA1234A1Z5' }),
      contact: JSON.stringify({ ownerName: 'Gaurav' }),
    });
    prismaMock.user.update.mockResolvedValue({
      id: 'new-owner-id',
      businessId: 'new-biz-id',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/business/register')
      .send({
        ownerName: 'Gaurav',
        email: 'owner@newbiz.example.com',
        phone: '+919422124928',
        password: 'ValidStrongPassword123!',
        legalName: 'VIT, Pune',
        gstin: '27AAACA1234A1Z5',
        businessType: 'Services',
      })
      .expect(201);

    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('owner@newbiz.example.com');
    expect(res.body.user.role).toBe(UserRole.BUSINESS_OWNER);
    expect(res.body.user.businessId).toBe('new-biz-id');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toContain('trustledger_session=');
  });

  it('POST /api/v1/business/register -> returns 409 if email already registered', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing-id',
      email: 'owner@newbiz.example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/business/register')
      .send({
        ownerName: 'Gaurav',
        email: 'owner@newbiz.example.com',
        phone: '+919422124928',
        password: 'ValidStrongPassword123!',
        legalName: 'VIT, Pune',
      })
      .expect(409);

    expect(res.body.message).toContain('already exists');
  });

  it('GET /api/v1/auth/me -> returns user profile and active csrfToken', async () => {
    const testCsrfToken = 'active-test-csrf-token-12345';
    const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

    prismaMock.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'test-session-uuid',
      userId: 'u-1',
      status: 'ACTIVE',
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      csrfTokenHash: testCsrfHash,
      revokedAt: null,
    });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'admin@banka.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      status: UserStatus.ACTIVE,
      institutionId: 'inst-1',
    });

    prismaMock.institution.findUnique.mockResolvedValue({
      id: 'inst-1',
      status: InstitutionStatus.ACTIVE,
      mspId: 'BankAOrgMSP',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', [`trustledger_session=test-session-uuid`])
      .set('x-csrf-token', testCsrfToken)
      .expect(200);

    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('admin@banka.example.com');
    expect(res.body).toHaveProperty('csrfToken');
  });

  it('GET /api/v1/auth/csrf -> returns or rotates csrfToken for active session', async () => {
    const testCsrfToken = 'active-test-csrf-token-12345';
    const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

    prismaMock.serverSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      sessionId: 'test-session-uuid',
      userId: 'u-1',
      status: 'ACTIVE',
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      csrfTokenHash: testCsrfHash,
      revokedAt: null,
    });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'admin@banka.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      status: UserStatus.ACTIVE,
      institutionId: 'inst-1',
    });

    prismaMock.institution.findUnique.mockResolvedValue({
      id: 'inst-1',
      status: InstitutionStatus.ACTIVE,
      mspId: 'BankAOrgMSP',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', [`trustledger_session=test-session-uuid`])
      .expect(200);

    expect(res.body).toHaveProperty('csrfToken');
  });
});


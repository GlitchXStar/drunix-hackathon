import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
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
});

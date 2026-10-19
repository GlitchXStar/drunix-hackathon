import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AuditModule } from './audit/audit.module';
import { OtpModule } from './otp/otp.module';
import { PolicyModule } from './policy/policy.module';
import { AuthModule } from './auth/auth.module';
import { LedgerModule } from './ledger/ledger.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConsentModule } from './consent/consent.module';
import { SessionGuard } from './auth/session.guard';
import { RolesGuard } from './policy/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    AuditModule,
    OtpModule,
    PolicyModule,
    AuthModule,
    LedgerModule,
    StorageModule,
    DocumentsModule,
    NotificationsModule,
    ConsentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}

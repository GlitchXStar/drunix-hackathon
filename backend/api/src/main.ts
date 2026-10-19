import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser for secure session cookies
  app.use(cookieParser());

  // Input validation with strict allow-list
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Set global API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Swagger OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('TrustLedger API')
    .setDescription('Consent-Based MSME Verification & Credit Risk Assessment API on Drunix')
    .setVersion('1.0')
    .addTag('System')
    .addCookieAuth('trustledger_session')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`TrustLedger API running on port ${port}`);
}

bootstrap();

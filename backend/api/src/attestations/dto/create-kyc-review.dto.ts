import { IsString, IsNotEmpty, IsEnum, IsArray, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KycOutcome } from '@prisma/client';

export class CreateKycReviewDto {
  @ApiProperty({ description: 'Consent grant ID authorizing this review', example: 'consent-uuid-123' })
  @IsString()
  @IsNotEmpty()
  consentId: string;

  @ApiProperty({ description: 'Active AccessSession ID during which documents were viewed', example: 'session-uuid-123' })
  @IsString()
  @IsNotEmpty()
  accessSessionId: string;

  @ApiProperty({ enum: KycOutcome, description: 'Review outcome', example: 'VERIFIED' })
  @IsEnum(KycOutcome)
  outcome: KycOutcome;

  @ApiProperty({ description: 'Internal KYC checklist items completed by the officer' })
  @IsObject()
  checklist: Record<string, boolean | string | number>;

  @ApiProperty({ description: 'Internal officer notes (strictly institution-private)', example: 'PAN and GSTIN cross-referenced with portal records' })
  @IsString()
  @IsNotEmpty()
  notes: string;

  @ApiProperty({ description: 'List of document references reviewed (must have been viewed in the session)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  docRefsReviewed: string[];
}

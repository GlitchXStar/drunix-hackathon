import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const ALLOWED_DOC_TYPES = [
  'INCORPORATION_CERTIFICATE',
  'GST_CERTIFICATE',
  'BANK_STATEMENT',
  'FINANCIAL_STATEMENT',
  'PAN_CARD',
  'UDYAM_REGISTRATION',
] as const;

export type AllowedDocType = (typeof ALLOWED_DOC_TYPES)[number];

export class UploadDocumentDto {
  @ApiProperty({
    description: 'Document type categorization',
    enum: ALLOWED_DOC_TYPES,
    example: 'GST_CERTIFICATE',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(ALLOWED_DOC_TYPES)
  docType: AllowedDocType;
}

import { BadRequestException } from '@nestjs/common';

export interface UploadedFileDto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per SPEC 8.5

export function validateDocumentFile(file: UploadedFileDto): { mime: string } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('EMPTY_FILE: No file content provided');
  }

  if (file.size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException('FILE_TOO_LARGE: File exceeds maximum allowed size of 10MB');
  }

  const buf = file.buffer;

  // Check PDF: starts with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  const isPdf =
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d;

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;

  // Check JPEG: FF D8 FF
  const isJpeg =
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff;

  if (isPdf) {
    return { mime: 'application/pdf' };
  }
  if (isPng) {
    return { mime: 'image/png' };
  }
  if (isJpeg) {
    return { mime: 'image/jpeg' };
  }

  throw new BadRequestException('INVALID_FILE_TYPE: Only PDF, PNG, and JPEG documents are permitted');
}

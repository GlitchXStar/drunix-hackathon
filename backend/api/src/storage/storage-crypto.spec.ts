import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvKeyProvider } from './key.provider';
import { LocalFsProvider } from './local-fs.provider';
import { validateDocumentFile } from '../documents/file-validator';
import { BadRequestException } from '@nestjs/common';

describe('Storage & Key Providers (Stage 4)', () => {
  let configService: ConfigService;
  let keyProvider: EnvKeyProvider;
  let localFsProvider: LocalFsProvider;
  const testStorageDir = path.resolve(process.cwd(), '.test-storage');

  beforeAll(async () => {
    configService = new ConfigService({
      MASTER_KEY: 'test-master-key-for-unit-tests-32b',
      LOCAL_STORAGE_DIR: testStorageDir,
    });
    keyProvider = new EnvKeyProvider(configService);
    localFsProvider = new LocalFsProvider(configService);
  });

  afterAll(async () => {
    try {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Cleanup
    }
  });

  describe('EnvKeyProvider (Envelope Encryption)', () => {
    it('wraps and unwraps a 256-bit DEK correctly', async () => {
      const plainDek = crypto.randomBytes(32);
      const wrapped = await keyProvider.wrapKey(plainDek);

      expect(typeof wrapped).toBe('string');
      expect(wrapped.length).toBeGreaterThan(0);

      const unwrapped = await keyProvider.unwrapKey(wrapped);
      expect(unwrapped.equals(plainDek)).toBe(true);
    });

    it('encrypts and decrypts salt correctly', async () => {
      const salt = crypto.randomBytes(32);
      const encryptedSalt = await keyProvider.encryptSalt(salt);

      expect(typeof encryptedSalt).toBe('string');
      const decryptedSalt = await keyProvider.decryptSalt(encryptedSalt);
      expect(decryptedSalt.equals(salt)).toBe(true);
    });

    it('fails to unwrap if wrapped payload is corrupted/tampered', async () => {
      const plainDek = crypto.randomBytes(32);
      const wrapped = await keyProvider.wrapKey(plainDek);

      // Corrupt payload
      const raw = Buffer.from(wrapped, 'base64').toString('utf8');
      const parsed = JSON.parse(raw);
      parsed.ct = 'badbeef' + parsed.ct.slice(7);
      const corrupted = Buffer.from(JSON.stringify(parsed)).toString('base64');

      await expect(keyProvider.unwrapKey(corrupted)).rejects.toThrow();
    });

    it('provides master key ID identification', () => {
      expect(keyProvider.getMasterKeyId()).toBe('env-master-key-v1');
    });
  });

  describe('LocalFsProvider', () => {
    it('stores, checks existence, retrieves, and deletes binary data', async () => {
      const key = `doc-${crypto.randomUUID()}`;
      const data = Buffer.from('Encrypted ciphertext bytes from AES-256-GCM', 'utf8');

      expect(await localFsProvider.exists(key)).toBe(false);

      await localFsProvider.store(key, data);
      expect(await localFsProvider.exists(key)).toBe(true);

      const retrieved = await localFsProvider.retrieve(key);
      expect(retrieved.equals(data)).toBe(true);

      await localFsProvider.delete(key);
      expect(await localFsProvider.exists(key)).toBe(false);
    });

    it('throws error when retrieving non-existent key', async () => {
      await expect(localFsProvider.retrieve('non-existent-key-123')).rejects.toThrow(
        'not found in local storage',
      );
    });
  });

  describe('File Magic Bytes & Size Validation (S-13)', () => {
    it('accepts valid PDF with %PDF- magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%synthetic test document content');
      const result = validateDocumentFile({
        buffer: pdfHeader,
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: pdfHeader.length,
      });
      expect(result.mime).toBe('application/pdf');
    });

    it('accepts valid PNG with 89 50 4E 47 magic bytes', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
      const result = validateDocumentFile({
        buffer: pngHeader,
        originalname: 'cert.png',
        mimetype: 'image/png',
        size: pngHeader.length,
      });
      expect(result.mime).toBe('image/png');
    });

    it('accepts valid JPEG with FF D8 FF magic bytes', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateDocumentFile({
        buffer: jpegHeader,
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: jpegHeader.length,
      });
      expect(result.mime).toBe('image/jpeg');
    });

    it('rejects spoofed extension (text file renamed to .pdf) (S-13)', () => {
      const textFile = Buffer.from('This is a plain text file, not a real PDF');
      expect(() =>
        validateDocumentFile({
          buffer: textFile,
          originalname: 'malicious.pdf',
          mimetype: 'application/pdf',
          size: textFile.length,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects file larger than 10MB limit (S-13)', () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      // Give it PDF header
      oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);

      expect(() =>
        validateDocumentFile({
          buffer: oversized,
          originalname: 'huge.pdf',
          mimetype: 'application/pdf',
          size: oversized.length,
        }),
      ).toThrow(BadRequestException);
    });
  });
});

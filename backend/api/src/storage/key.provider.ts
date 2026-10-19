import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { KeyProvider } from './storage.interface';

/**
 * EnvKeyProvider implements envelope encryption of Data Encryption Keys (DEKs)
 * and salts using a master key derived from the environment.
 *
 * NOTE per SPEC N-5 & D-2:
 * "The prototype's key handling stands in for a real HSM/KMS production design."
 */
@Injectable()
export class EnvKeyProvider implements KeyProvider {
  private readonly logger = new Logger(EnvKeyProvider.name);
  private readonly masterKey: Buffer;
  private readonly masterKeyId = 'env-master-key-v1';

  constructor(private readonly config: ConfigService) {
    const rawKey = this.config.get<string>('MASTER_KEY') || 'trustledger-default-development-master-key-32bytes';
    // Derive exactly 32 bytes (256 bits) for AES-256
    this.masterKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  getMasterKeyId(): string {
    return this.masterKeyId;
  }

  async wrapKey(plainDek: Buffer): Promise<string> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainDek), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ct: encrypted.toString('hex'),
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  async unwrapKey(wrappedDek: string): Promise<Buffer> {
    try {
      const raw = Buffer.from(wrappedDek, 'base64').toString('utf8');
      const parsed = JSON.parse(raw);
      const iv = Buffer.from(parsed.iv, 'hex');
      const tag = Buffer.from(parsed.tag, 'hex');
      const ct = Buffer.from(parsed.ct, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch (err) {
      throw new Error(`Failed to unwrap DEK: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async encryptSalt(salt: Buffer): Promise<string> {
    return this.wrapKey(salt);
  }

  async decryptSalt(encryptedSalt: string): Promise<Buffer> {
    return this.unwrapKey(encryptedSalt);
  }
}

export interface StorageProvider {
  store(key: string, data: Buffer): Promise<void>;
  retrieve(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface KeyProvider {
  wrapKey(plainDek: Buffer): Promise<string>;
  unwrapKey(wrappedDek: string): Promise<Buffer>;
  encryptSalt(salt: Buffer): Promise<string>;
  decryptSalt(encryptedSalt: string): Promise<Buffer>;
  getMasterKeyId(): string;
}

export const KEY_PROVIDER = 'KEY_PROVIDER';

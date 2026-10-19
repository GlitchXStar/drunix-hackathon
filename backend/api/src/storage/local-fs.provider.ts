import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider } from './storage.interface';

@Injectable()
export class LocalFsProvider implements StorageProvider {
  private readonly logger = new Logger(LocalFsProvider.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    this.baseDir = this.config.get<string>('LOCAL_STORAGE_DIR') || path.resolve(process.cwd(), '.storage');
    // Ensure base directory exists synchronously or lazily
    fs.mkdir(this.baseDir, { recursive: true }).catch((err) => {
      this.logger.error(`Failed to create storage directory ${this.baseDir}:`, err);
    });
  }

  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const safeKey = path.basename(key);
    return path.join(this.baseDir, safeKey);
  }

  async store(key: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const target = this.getFilePath(key);
    await fs.writeFile(target, data);
  }

  async retrieve(key: string): Promise<Buffer> {
    const target = this.getFilePath(key);
    try {
      return await fs.readFile(target);
    } catch {
      throw new Error(`File with key ${key} not found in local storage`);
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.getFilePath(key);
    try {
      await fs.unlink(target);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        return; // Already deleted
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = this.getFilePath(key);
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}

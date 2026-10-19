import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './storage.interface';

@Injectable()
export class NextcloudProvider implements StorageProvider {
  private readonly logger = new Logger(NextcloudProvider.name);
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly pass: string;
  private readonly authHeader: string;
  private readonly folder: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('NEXTCLOUD_URL', 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.user = this.config.get<string>('NEXTCLOUD_USER', 'admin');
    this.pass = this.config.get<string>('NEXTCLOUD_PASSWORD', 'admin');
    this.folder = this.config.get<string>('NEXTCLOUD_FOLDER', 'trustledger').replace(/^\/+|\/+$/g, '');
    this.authHeader = `Basic ${Buffer.from(`${this.user}:${this.pass}`).toString('base64')}`;
  }

  private getUrl(key: string): string {
    const safeKey = encodeURIComponent(key);
    return `${this.baseUrl}/remote.php/dav/files/${this.user}/${this.folder}/${safeKey}`;
  }

  async store(key: string, data: Buffer): Promise<void> {
    const url = this.getUrl(key);
    try {
      if (typeof fetch === 'undefined') {
        throw new Error('Global fetch is not available in current Node runtime');
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(data),
      });

      if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`Nextcloud WebDAV store failed with status ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      this.logger.error(`Failed to store key ${key} in Nextcloud:`, err);
      throw new Error(`Nextcloud storage error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async retrieve(key: string): Promise<Buffer> {
    const url = this.getUrl(key);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`File not found or inaccessible in Nextcloud (status ${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      throw new Error(`Nextcloud retrieve error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async delete(key: string): Promise<void> {
    const url = this.getUrl(key);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: this.authHeader,
        },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Nextcloud delete failed with status ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete key ${key} in Nextcloud:`, err);
      throw new Error(`Nextcloud delete error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const url = this.getUrl(key);
    try {
      const response = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '0',
        },
      });
      return response.status === 207 || response.status === 200;
    } catch {
      return false;
    }
  }
}

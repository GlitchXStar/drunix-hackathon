import { Injectable, ConflictException } from '@nestjs/common';

interface IdempotentEntry {
  status: 'PENDING' | 'COMPLETED';
  response?: any;
  createdAt: number;
}

@Injectable()
export class IdempotencyService {
  private readonly store = new Map<string, IdempotentEntry>();
  private readonly ttlMs = 24 * 60 * 60 * 1000; // 24 hours

  async execute<T>(
    idempotencyKey: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!idempotencyKey) {
      return action();
    }

    const cleanKey = idempotencyKey.trim();
    if (!cleanKey) {
      return action();
    }

    const existing = this.store.get(cleanKey);
    if (existing) {
      if (existing.status === 'PENDING') {
        throw new ConflictException({
          code: 'IDEMPOTENCY_IN_FLIGHT',
          message: 'An operation with this Idempotency-Key is currently in progress',
        });
      }
      return existing.response as T;
    }

    this.store.set(cleanKey, {
      status: 'PENDING',
      createdAt: Date.now(),
    });

    try {
      const result = await action();
      this.store.set(cleanKey, {
        status: 'COMPLETED',
        response: result,
        createdAt: Date.now(),
      });
      return result;
    } catch (err) {
      this.store.delete(cleanKey);
      throw err;
    }
  }

  // Periodic memory cleanup
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}

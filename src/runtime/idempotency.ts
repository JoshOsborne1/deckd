/**
 * Idempotency registry (blueprint §7.2, Phase 2).
 *
 * Duplicate intents are rejected idempotently: the second submission returns
 * the original result without side effects.
 */

export interface IdempotencyRecord<T> {
  result: T;
  timestamp: number;
}

export class IdempotencyRegistry<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Get an existing record, or null if absent / expired. */
  get(key: string): IdempotencyRecord<T> | null {
    const record = this.records.get(key);
    if (!record) return null;
    if (Date.now() - record.timestamp > this.ttlMs) {
      this.records.delete(key);
      return null;
    }
    return record;
  }

  /** Store a result. Overwrites any existing record with the same key. */
  set(key: string, result: T): void {
    this.records.set(key, { result, timestamp: Date.now() });
  }

  /** Whether a key exists and is fresh. */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /** Clear expired entries. */
  prune(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now - record.timestamp > this.ttlMs) {
        this.records.delete(key);
      }
    }
  }
}

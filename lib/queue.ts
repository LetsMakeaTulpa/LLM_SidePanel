/** Counting semaphore. Permits are handed directly to waiters, so the cap holds. */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`Semaphore limit must be a positive integer, got ${limit}`);
    this.limit = limit;
    this.available = limit;
  }

  get active(): number {
    return this.limit - this.available;
  }

  get pending(): number {
    return this.waiters.length;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    if (this.available < this.limit) this.available += 1;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export const LLM_MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY || 3);

/** Every LLM call in the process goes through this semaphore. */
export const llmSemaphore = new Semaphore(Number.isFinite(LLM_MAX_CONCURRENCY) ? LLM_MAX_CONCURRENCY : 3);

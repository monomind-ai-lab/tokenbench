/** Vitest-only runtime shim. Wrangler resolves `cloudflare:workers` natively. */
export class DurableObject<Env = unknown> {
  protected readonly ctx: CloudflareDurableObjectState;
  protected readonly env: Env;

  constructor(ctx: CloudflareDurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export interface CloudflareDurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(when: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface CloudflareDurableObjectState {
  readonly storage: CloudflareDurableObjectStorage;
}

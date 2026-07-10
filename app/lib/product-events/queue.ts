import type { ProductEventInput } from "./registry";

export interface ProductEventQueue {
  add(event: ProductEventInput): void;
  flushNow(): Promise<void>;
  dispose(): Promise<void>;
}

interface QueueOptions {
  intervalMs?: number;
  batchCap?: number;
  retry?: number;
  onDrop?: (events: ProductEventInput[], error: unknown) => void;
}

export function createProductEventQueue(
  flush: (events: ProductEventInput[]) => Promise<unknown>,
  options: QueueOptions = {},
): ProductEventQueue {
  const intervalMs = options.intervalMs ?? 5000;
  const batchCap = options.batchCap ?? 20;
  const retry = options.retry ?? 1;
  const pending = new Map<string, ProductEventInput>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let disposed = false;

  function schedule() {
    if (timer !== null || disposed) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, intervalMs);
  }

  async function send(batch: ProductEventInput[]) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        await flush(batch);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    options.onDrop?.(batch, lastError);
  }

  async function drain(): Promise<void> {
    if (inFlight) {
      await inFlight;
      if (pending.size > 0) return drain();
      return;
    }
    if (pending.size === 0) return;
    const batch = [...pending.values()].slice(0, batchCap);
    for (const event of batch) pending.delete(event.event_id);
    inFlight = send(batch).finally(() => { inFlight = null; });
    await inFlight;
    if (pending.size > 0) await drain();
  }

  return {
    add(event) {
      if (disposed || pending.has(event.event_id)) return;
      pending.set(event.event_id, event);
      if (pending.size >= batchCap) void drain();
      else schedule();
    },
    flushNow() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      return drain();
    },
    async dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      await drain();
      disposed = true;
    },
  };
}

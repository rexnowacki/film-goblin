/**
 * Batches FYP impression ids for fire-and-forget flushing. An id is flushed
 * at most once per queue lifetime (one page view). Pure logic — the caller
 * wires it to IntersectionObserver + the recordFypImpressions action.
 */
export function createImpressionQueue(
  flush: (ids: string[]) => void,
  intervalMs = 5000,
): { add(id: string): void; flushNow(): void; dispose(): void } {
  const pending = new Set<string>();
  const sent = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function drain() {
    if (pending.size === 0) return;
    const ids = [...pending];
    pending.clear();
    for (const id of ids) sent.add(id);
    flush(ids);
  }

  return {
    add(id: string) {
      if (disposed || sent.has(id) || pending.has(id)) return;
      pending.add(id);
      if (timer === null) timer = setInterval(drain, intervalMs);
    },
    flushNow: drain,
    dispose() {
      drain();
      if (timer !== null) clearInterval(timer);
      timer = null;
      disposed = true;
    },
  };
}

"use client";

import { recordProductEvents } from "@/lib/actions/product-events";
import { createProductEventQueue } from "./queue";
import { getOrCreateProductSession } from "./session";
import { validateProductEvent, type ProductEventInput, type ProductEventName, type ProductEventProperties } from "./registry";

let queue: ReturnType<typeof createProductEventQueue> | null = null;

function getQueue() {
  if (!queue) {
    queue = createProductEventQueue(
      async events => { await recordProductEvents(events); },
      { onDrop: (_events, error) => console.warn("product events dropped after retry", error) },
    );
  }
  return queue;
}

export function trackProductEvent(input: {
  event_name: ProductEventName;
  path?: string | null;
  subject_type?: string | null;
  subject_id?: string | null;
  properties?: ProductEventProperties;
}): ProductEventInput {
  const session = getOrCreateProductSession(window.sessionStorage);
  const event = validateProductEvent({
    ...input,
    event_id: crypto.randomUUID(),
    session_id: session.id,
    occurred_at: new Date().toISOString(),
  });
  getQueue().add(event);
  return event;
}

export function flushProductEvents(): Promise<void> {
  return queue?.flushNow() ?? Promise.resolve();
}

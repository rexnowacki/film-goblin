export const PRODUCT_EVENT_NAMES = [
  "session_started",
  "return_contract_viewed",
  "return_contract_acted",
  "taste_twin_viewed",
  "taste_twin_request_sent",
  "gazing_created",
  "gazing_rsvp_changed",
  "gazing_reminder_opened",
  "gazing_closed",
  "attendance_confirmed",
  "aftermath_verdict_recorded",
  "continuation_prompt_viewed",
  "continuation_prompt_acted",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export type ProductEventProperties = Record<string, string | number | boolean | null>;

export interface ProductEventInput {
  event_id: string;
  event_name: ProductEventName;
  session_id: string;
  path?: string | null;
  subject_type?: string | null;
  subject_id?: string | null;
  properties?: ProductEventProperties;
  occurred_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROPERTIES_BYTES = 2048;
const MAX_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

const PROPERTY_KEYS: Record<ProductEventName, readonly string[]> = {
  session_started: ["entry_source"],
  return_contract_viewed: ["contract_kind", "contract_key"],
  return_contract_acted: ["contract_kind", "contract_key", "action"],
  taste_twin_viewed: ["source"],
  taste_twin_request_sent: ["source"],
  gazing_created: ["venue_kind", "audience"],
  gazing_rsvp_changed: ["attending"],
  gazing_reminder_opened: ["reminder_kind", "source"],
  gazing_closed: ["status"],
  attendance_confirmed: [],
  aftermath_verdict_recorded: ["recommended"],
  continuation_prompt_viewed: ["source_action", "continuation_kind"],
  continuation_prompt_acted: ["source_action", "continuation_kind"],
};

const SUBJECT_RULES: Record<ProductEventName, { type: string | null; required: boolean }> = {
  session_started: { type: null, required: false },
  return_contract_viewed: { type: null, required: false },
  return_contract_acted: { type: null, required: false },
  taste_twin_viewed: { type: "profile", required: true },
  taste_twin_request_sent: { type: "profile", required: true },
  gazing_created: { type: "gazing_invite", required: true },
  gazing_rsvp_changed: { type: "gazing_invite", required: true },
  gazing_reminder_opened: { type: "gazing_invite", required: true },
  gazing_closed: { type: "gazing_invite", required: true },
  attendance_confirmed: { type: "gazing_invite", required: true },
  aftermath_verdict_recorded: { type: "gazing_invite", required: true },
  continuation_prompt_viewed: { type: null, required: false },
  continuation_prompt_acted: { type: null, required: false },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function boundedString(value: unknown, field: string, max: number): string | null | undefined {
  if (value == null) return value as null | undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && (PRODUCT_EVENT_NAMES as readonly string[]).includes(value);
}

export function scrubProductEventProperties(
  name: ProductEventName,
  value: unknown,
): ProductEventProperties {
  if (value == null) return {};
  if (!isPlainObject(value)) throw new Error("invalid properties");
  const allowed = new Set(PROPERTY_KEYS[name]);
  const out: ProductEventProperties = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) throw new Error(`property not allowed: ${key}`);
    if (!isScalar(item) || (typeof item === "number" && !Number.isFinite(item))) {
      throw new Error(`invalid property: ${key}`);
    }
    if (typeof item === "string" && item.length > 128) throw new Error(`property too long: ${key}`);
    out[key] = item;
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_PROPERTIES_BYTES) {
    throw new Error("properties too large");
  }
  return out;
}

export function validateProductEvent(value: unknown, nowMs = Date.now()): ProductEventInput {
  if (!isPlainObject(value)) throw new Error("invalid product event");
  if (!isProductEventName(value.event_name)) throw new Error("unknown event name");
  if (typeof value.event_id !== "string" || !UUID_RE.test(value.event_id)) throw new Error("invalid event_id");
  if (typeof value.session_id !== "string" || !UUID_RE.test(value.session_id)) throw new Error("invalid session_id");

  const occurredAt = boundedString(value.occurred_at, "occurred_at", 40);
  const occurredMs = Date.parse(occurredAt ?? "");
  if (!Number.isFinite(occurredMs) || occurredMs < nowMs - MAX_PAST_MS || occurredMs > nowMs + MAX_FUTURE_MS) {
    throw new Error("occurred_at outside accepted window");
  }

  const path = boundedString(value.path, "path", 240);
  if (path != null && (!path.startsWith("/") || path.includes("?") || path.includes("#"))) {
    throw new Error("invalid path");
  }

  const subjectType = boundedString(value.subject_type, "subject_type", 40);
  const subjectId = boundedString(value.subject_id, "subject_id", 36);
  if (subjectId != null && !UUID_RE.test(subjectId)) throw new Error("invalid subject_id");
  const subjectRule = SUBJECT_RULES[value.event_name];
  if (subjectRule.required && (subjectType !== subjectRule.type || subjectId == null)) {
    throw new Error("subject required");
  }
  if (subjectType != null && subjectType !== subjectRule.type) throw new Error("invalid subject_type");
  if (subjectType == null && subjectId != null) throw new Error("subject_type required");

  return {
    event_id: value.event_id,
    event_name: value.event_name,
    session_id: value.session_id,
    path,
    subject_type: subjectType,
    subject_id: subjectId,
    properties: scrubProductEventProperties(value.event_name, value.properties),
    occurred_at: new Date(occurredMs).toISOString(),
  };
}

export interface ProductEventFact {
  event_name: ProductEventName;
  occurred_at: string;
}

const MEANINGFUL_EVENTS = new Set<ProductEventName>([
  "return_contract_acted",
  "taste_twin_request_sent",
  "gazing_created",
  "gazing_rsvp_changed",
  "gazing_closed",
  "attendance_confirmed",
  "aftermath_verdict_recorded",
  "continuation_prompt_acted",
]);

export function isMeaningfulReturn(events: ProductEventFact[]): boolean {
  return events.some(event => MEANINGFUL_EVENTS.has(event.event_name));
}

export const BADGE_NAME_MAX = 80;
export const BADGE_SLUG_MAX = 64;
export const BADGE_DESCRIPTION_MAX = 280;
export const BADGE_THRESHOLD_MAX = 10_000;

export const BADGE_CONDITIONS = [
  {
    value: "watch_log_count",
    label: "Watch logs",
    help: "Counts every diary entry. Rewatches count.",
  },
  {
    value: "distinct_film_count",
    label: "Distinct films logged",
    help: "Counts each film once, even when it is rewatched.",
  },
  {
    value: "director_distinct_film_count",
    label: "Distinct films by one director",
    help: "Qualifies when any one director reaches the threshold.",
  },
] as const;

export type BadgeConditionKind = (typeof BADGE_CONDITIONS)[number]["value"];

export interface BadgeDefinitionInput {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  conditionKind: BadgeConditionKind;
  threshold: number;
}

const CONDITION_KINDS = new Set<string>(BADGE_CONDITIONS.map(option => option.value));
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BADGE_STORAGE_PREFIX = "/storage/v1/object/public/badge-images/";

export function isBadgeConditionKind(value: string): value is BadgeConditionKind {
  return CONDITION_KINDS.has(value);
}

export function slugifyBadgeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BADGE_SLUG_MAX)
    .replace(/-+$/g, "");
}

export function describeBadgeCondition(kind: BadgeConditionKind, threshold: number): string {
  const noun = threshold === 1 ? "film" : "films";
  switch (kind) {
    case "watch_log_count":
      return `At least ${threshold} watch ${threshold === 1 ? "log" : "logs"} (rewatches count)`;
    case "distinct_film_count":
      return `At least ${threshold} distinct ${noun} logged`;
    case "director_distinct_film_count":
      return `At least ${threshold} distinct ${noun} from one director`;
  }
}

function hasAllowedBadgeImageUrl(imageUrl: string, storageOrigin: string): boolean {
  if (!storageOrigin) return false;
  try {
    const allowed = new URL(storageOrigin);
    const candidate = new URL(imageUrl);
    if (candidate.origin !== allowed.origin || candidate.search || candidate.hash) return false;
    if (!candidate.pathname.startsWith(BADGE_STORAGE_PREFIX)) return false;
    return candidate.pathname.length > BADGE_STORAGE_PREFIX.length;
  } catch {
    return false;
  }
}

export function validateBadgeDefinition(
  input: BadgeDefinitionInput,
  storageOrigin: string,
): string | null {
  const name = input.name.trim();
  const slug = input.slug.trim();
  const description = input.description.trim();

  if (!name) return "Name is required.";
  if (name.length > BADGE_NAME_MAX) return `Name must be ${BADGE_NAME_MAX} characters or fewer.`;
  if (slug.length > BADGE_SLUG_MAX) return `Slug must be ${BADGE_SLUG_MAX} characters or fewer.`;
  if (!SLUG_PATTERN.test(slug)) {
    return "Slug must use lower-case letters, numbers, and single hyphens.";
  }
  if (!description) return "Description is required.";
  if (description.length > BADGE_DESCRIPTION_MAX) {
    return `Description must be ${BADGE_DESCRIPTION_MAX} characters or fewer.`;
  }
  if (!isBadgeConditionKind(input.conditionKind)) return "Choose a supported badge condition.";
  if (
    !Number.isInteger(input.threshold)
    || input.threshold < 1
    || input.threshold > BADGE_THRESHOLD_MAX
  ) {
    return "Threshold must be a whole number between 1 and 10,000.";
  }
  if (!storageOrigin) return "Badge image storage is not configured.";
  if (!hasAllowedBadgeImageUrl(input.imageUrl, storageOrigin)) {
    return "Upload artwork to the badge image bucket.";
  }
  return null;
}

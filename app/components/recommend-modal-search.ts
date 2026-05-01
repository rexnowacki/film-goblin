export interface Searchable {
  id: string;
  username: string;
  display_name: string | null;
}

/**
 * Case-insensitive substring match against username AND display_name.
 * Empty / whitespace-only query returns []. Order of input is preserved.
 *
 * Extracted from RecommendModal so the matching logic is unit-testable
 * without mounting the component.
 */
export function filterCovenMembers<T extends Searchable>(members: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return members.filter(m =>
    m.username.toLowerCase().includes(q) ||
    (m.display_name?.toLowerCase().includes(q) ?? false)
  );
}

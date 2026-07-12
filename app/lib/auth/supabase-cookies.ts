export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
}

export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_RE = /^[a-z0-9._]+$/;
export const USERNAME_RULES_MESSAGE =
  "Username: lowercase letters, numbers, dots, underscores only (max 24); needs a letter or number; can't start or end with a dot.";

export function isValidUsername(username: string): boolean {
  return (
    username.length > 0 &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_RE.test(username) &&
    /[a-z0-9]/.test(username) &&
    !username.startsWith(".") &&
    !username.endsWith(".")
  );
}

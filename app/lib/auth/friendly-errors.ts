export function friendlyError(err: unknown): string {
  if (err === null || err === undefined) return "Something went wrong.";
  const msg = typeof err === "string" ? err : (err as any)?.message ?? "";
  if (!msg) return "Something went wrong.";

  const map: Record<string, string> = {
    "Invalid login credentials": "Email or password is incorrect.",
    "Email not confirmed": "Check your inbox — we sent a confirmation link when you signed up.",
    "User already registered": "An account with this email already exists. Sign in instead?",
    "Password should be at least 6 characters": "Password must be at least 8 characters.",
    "Password is known to be weak and easy to guess": "That password is too common. Try a stronger one.",
    "For security purposes, you can only request this once every 60 seconds": "Please wait a minute before requesting another email.",
    "New password should be different from the old password": "Pick a different password than the one you currently have.",
    "Email rate limit exceeded": "You've requested too many emails. Try again in a few minutes.",
  };
  return map[msg] ?? msg;
}

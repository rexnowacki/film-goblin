import { randomBytes } from "crypto";

export function generateGazingToken(): string {
  return randomBytes(16).toString("base64url");
}

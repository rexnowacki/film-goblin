import type { Client } from "pg";

/**
 * Switches the current connection to run as a specific user. Combines SET ROLE
 * (so privileges match the `authenticated` role) with a JWT claim (so auth.uid()
 * returns the right value). Use within a BEGIN/COMMIT to ensure SET LOCAL semantics.
 */
export async function beginAs(
  client: Client,
  userId: string | null,
  role: "anon" | "authenticated" | "service_role" = "authenticated"
): Promise<void> {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE ${role}`);
  if (userId) {
    await client.query(`SET LOCAL request.jwt.claim.sub TO '${userId}'`);
  } else {
    await client.query(`SET LOCAL request.jwt.claim.sub TO ''`);
  }
  await client.query(`SET LOCAL request.jwt.claim.role TO '${role}'`);
}

export async function rollback(client: Client): Promise<void> {
  await client.query("ROLLBACK");
}

export async function commit(client: Client): Promise<void> {
  await client.query("COMMIT");
}

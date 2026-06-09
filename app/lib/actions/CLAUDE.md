# app/lib/actions/ — Server Actions

All files use `"use server"` at the top. Mutations live here; reads live in `../queries/`.

## Private/public split

Every action that needs a Supabase client follows this two-function shape:

```ts
// Private: Supabase client injected → testable in isolation
export async function _doThing(client: Client, arg: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  // ... mutation
}

// Public: creates the server client, calls private form, revalidates
export async function doThing(arg: string) {
  const c = await createClient();
  await _doThing(c, arg);
  revalidatePath("/some-route");
}
```

`revalidatePath` belongs in the public wrapper only — never in the private function. The private function is for logic; the public wrapper is for Next.js cache plumbing.

## Auth guard

Use `requireAuthUser` from `@/lib/auth/require-auth-user` — it calls `getUser()`, throws on failure, and returns the `User`. Never trust middleware alone.

```ts
import { requireAuthUser } from "@/lib/auth/require-auth-user";

const user = await requireAuthUser(client); // throws if unauthenticated
```

Only use the raw `client.auth.getUser()` pattern when the failure case returns a structured value rather than throwing (e.g. `if (!user) return { ok: false, error: "..." }`). Those intentional return-on-unauth cases in public wrappers should stay as-is.

## Admin actions (`admin/` subdirectory)

Admin actions call `requireAdmin()` from `app/lib/auth/require-admin.ts` before anything else, then use `serviceRoleClient()` for DB writes. `requireAdmin()` throws if the caller is not an admin — no need to double-check after.

## Adding a new profile field

`_updateProfile` in `profile.ts` does `const patch: ProfileUpdate = { ...fields }`. To wire a new field end-to-end:

1. Add column in a migration, regen types (`npm run gen:types` from `app/`)
2. Add the field to the `ProfileFields` interface in `profile.ts`
3. Add the input + `save()` extraction in `app/settings/components/SettingsForm.tsx`

No new server action needed — the spread handles it automatically.

## Rate limiting

Two limiters live in `@/lib/rate-limit`:

- `consumeRateLimit` is user-keyed (mig 0190) for authenticated actions. It
  fails closed on RPC errors.
- `consumeIpRateLimit` is subject-keyed (mig 0204) for pre-auth actions such as
  sign-in, sign-up, and username availability checks. It fails open on RPC
  errors so auth is not bricked during deploys or rate-limit infra issues.

Use `getClientIpHash()` for IP buckets and `hashKey()` for non-IP subject
buckets such as sign-in identifier throttles.

## Env-blocked integration tests

Tests that need real Supabase require **both** guards:

```ts
const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
describe.skipIf(!hasEnv)("my action", () => {
  beforeAll(async () => {
    if (!hasEnv) return;   // ← this guard is required in addition to skipIf
    // ...
  });
});
```

Without the `if (!hasEnv) return` in lifecycle hooks, the hook crashes before `describe.skipIf` can skip, and the file reports red. See `app/tests/actions/library.test.ts` as the template.

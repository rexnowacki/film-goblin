# Identity at Signup — Design

**Status:** spec
**Date:** 2026-04-29
**Sub-project:** 20 (next after onboarding redesign at 19). Touches signup form + signUp action + on_auth_user trigger + OnboardingForm. One small migration replacing the trigger body. No schema changes.

## Goal

Move handle + display_name into the signup form so identity is set deliberately at account creation, not patched in via onboarding's update-of-an-existing-row dance. The auto-generated handle (`tieflinggreaser` derived from `tieflinggreaser@gmail.com`) becomes a fallback for OAuth-only paths, never a default the user has to discover and overwrite. Onboarding shrinks to true preference-seeding (threshold + watchlist).

This is the structural fix for the recent "teeth tony" 404: a user typed their display name into the handle field, the system accepted a handle with a space, and the avatar link 404'd. With identity at signup, the handle and display_name are separate fields with separate validation rules, and uniqueness collisions surface before the account exists.

## What ships

1. **Signup form** (`/auth/signup`) gains two new inputs:
   - **Display Name** — 1-40 chars after trim, Unicode allowed, no leading/trailing whitespace.
   - **Handle** — `/^[a-z0-9._]+$/`, max 24 chars. Auto-suggests from display_name (lowercase + strip non-allowed chars) until the user manually edits the handle field, at which point it locks and further display_name changes don't overwrite.
   - Order: Email → Password → Display Name → Handle.

2. **`signUp` action** validates both new fields server-side (regex + length), then pre-checks handle uniqueness via the admin client (anon RLS won't show all profiles for collision detection). Returns specific error codes: `handle_format`, `handle_taken`, `display_name_invalid`, alongside today's `email_duplicate`. Passes the validated values to Supabase via `auth.signUp({ options: { data: { handle, display_name } } })`.

3. **`on_auth_user` trigger** reads `NEW.raw_user_meta_data->>'handle'` and `->>'display_name'`. If both present and the handle passes the regex, uses them directly. If absent or invalid (OAuth Google path, where there's no signup form), falls back to today's email-derived auto-generation with collision suffix loop. New migration `0136_profile_trigger_metadata.sql` replaces the trigger body.

4. **OnboardingForm** continues to render the handle field but pre-fills it from `profile.handle` (today it starts empty). For email/password users this shows what they picked at signup — they can leave it as-is or tweak. For OAuth users this shows the auto-generated handle — they can edit it deliberately before completing onboarding. Validation regex unchanged.

5. **`_completeOnboarding`** unchanged in behavior. Still validates handle regex; still calls `update({ handle })`. When the OnboardingForm submits an unchanged handle, the SQL update is a same-value no-op.

## Out of scope

- **Live handle-availability check on signup form** (debounced lookup as the user types). Defer to v2; on-submit error is acceptable for v1. Reduces complexity (no debounce + spinner + race-condition handling) and the failure mode is graceful (user sees error, types another handle).
- **Display name validation in `/settings`.** Today the settings form lets the user update display_name with no checks. Same applies post-signup. Adding validation there is a separate small follow-up.
- **Backfilling existing users' display_names.** Today every profile has `display_name = handle` (set by the trigger or by `_completeOnboarding`). Existing users keep this; nothing changes for them. New users get a true display_name distinct from handle.
- **Removing the OnboardingForm handle field entirely.** Defensible argument — but OAuth users need a chance to edit their auto-generated handle before /home, and OnboardingForm is the natural place. Keeping it serves both flows.
- **Migrating the auto-generated handles of existing OAuth users.** They keep what the trigger gave them (e.g., `tieflinggreaser`). Editable in `/settings` or in onboarding if they re-run it.
- **Removing the trigger's auto-generation logic.** Kept as the OAuth fallback. Email/password signups go through the metadata path; OAuth signups continue to use auto-generation. The trigger handles both transparently.
- **Admin-created users.** The `/admin/users/new` flow uses the admin client and may not pass metadata. The trigger's fallback handles this — they get auto-generated handles. Admin can manually update via `/admin/users/[id]`.
- **Display name validation rules richer than length+trim.** No banned-substring lists, no profanity filtering, no display_name uniqueness (display names are NOT unique — only handles are).

## Locked design decisions

| Q | Decision |
|---|---|
| Field order on signup form | Email → Password → Display Name → Handle |
| Handle auto-suggest from display_name | Yes; lowercase + strip non-allowed chars; locks on first manual handle edit |
| Handle validation | `/^[a-z0-9._]+$/`, max 24 chars (matches OnboardingForm + `_completeOnboarding`) |
| Display name validation | 1-40 chars after trim, Unicode allowed |
| Handle uniqueness check | Server-side in signUp action via admin client; on-submit, not live |
| Display name uniqueness | None — display names are not unique |
| OAuth fallback | Trigger auto-generates from email if metadata absent |
| OnboardingForm handle field | Kept, pre-filled from profile, editable |
| `_completeOnboarding` behavior | Unchanged; validates and updates handle (no-op when same) |
| Existing user data | Unchanged; existing handles + display_names preserved |
| Schema migration | None; only trigger body update |
| Display name auto-set in onboarding | Removed: `_completeOnboarding` no longer sets `display_name = handle` |

## Sections

### Section 1 — Migration

`db/migrations/0136_profile_trigger_metadata.sql`. CREATE OR REPLACE FUNCTION on `handle_new_auth_user` so it reads `raw_user_meta_data` first, falls back to email-derived auto-generation second.

```sql
-- 0136: profile trigger reads handle + display_name from auth metadata.
--
-- Email/password signups now pass the user's chosen handle + display_name
-- via auth.signUp options.data, which lands in auth.users.raw_user_meta_data.
-- The trigger reads them when present and validates the handle. OAuth signups
-- (Google) don't pass metadata; the trigger falls back to today's email-derived
-- auto-generation with collision suffix loop, identical to pre-0136 behavior.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_handle  TEXT := NEW.raw_user_meta_data->>'handle';
  meta_display TEXT := NEW.raw_user_meta_data->>'display_name';
  base_handle  TEXT;
  final_handle TEXT;
  final_display TEXT;
  suffix       INTEGER := 0;
BEGIN
  IF meta_handle IS NOT NULL AND meta_handle ~ '^[a-z0-9._]+$' AND length(meta_handle) <= 24 THEN
    final_handle := meta_handle;
    final_display := COALESCE(NULLIF(trim(meta_display), ''), meta_handle);
  ELSE
    base_handle := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    IF base_handle = '' THEN
      base_handle := 'goblin';
    END IF;
    final_handle := base_handle;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(handle) = lower(final_handle)) LOOP
      suffix := suffix + 1;
      final_handle := base_handle || suffix::text;
    END LOOP;
    final_display := final_handle;
  END IF;

  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, final_handle, final_display);

  RETURN NEW;
END;
$$;
```

Notes:
- Metadata-path does NOT do the suffix-loop because uniqueness is pre-checked by `signUp` server-side before the auth.users INSERT happens.
- If the metadata-pre-check is somehow stale (race between two signups picking the same handle within ms), the unique-on-handle index throws and the auth.users INSERT fails, surfacing to the user as a generic signup error. Acceptable rare edge case.

### Section 2 — `signUp` action

Add validation + uniqueness pre-check + metadata pass-through.

```ts
const HANDLE_RE = /^[a-z0-9._]+$/;

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const handle = String(formData.get("handle") || "").trim();
  const origin = String(formData.get("origin") || "");

  if (displayName.length < 1 || displayName.length > 40) {
    return { error: "Display name must be 1-40 characters." };
  }
  if (!HANDLE_RE.test(handle) || handle.length > 24) {
    return { error: "Handle: lowercase letters, numbers, dots, underscores only (max 24)." };
  }

  const admin = adminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "That handle is taken." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { handle, display_name: displayName },
      emailRedirectTo: `${origin}/api/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Email already registered.", duplicate: true };
    }
    return { error: error.message };
  }
  return { info: "Check your email to confirm." };
}
```

`adminClient` is the service-role Supabase client; we already use it in admin routes (`app/lib/supabase/admin.ts` per existing convention). The uniqueness pre-check runs through it because RLS on `profiles` may not let anon read other users' handles.

### Section 3 — Signup form

`/auth/signup/page.tsx` gets two new inputs after password. Display name has no auto-suggest (it's free text). Handle has auto-suggest from display_name with manual-edit lock.

State sketch:

```tsx
const [displayName, setDisplayName] = useState("");
const [handle, setHandle] = useState("");
const [handleEdited, setHandleEdited] = useState(false);

useEffect(() => {
  if (!handleEdited) {
    const suggested = displayName.toLowerCase().replace(/[^a-z0-9._]/g, "");
    setHandle(suggested.slice(0, 24));
  }
}, [displayName, handleEdited]);

function onHandleChange(v: string) {
  setHandle(v);
  setHandleEdited(true);
}
```

The lock semantic: as soon as the user touches the handle input, auto-suggest stops. They can still clear the handle field to re-engage the suggester (a small UX nicety, optional v1).

Error display: today's signup form shows a single `error` div in `var(--blood)`. Reuse for new error codes; the action returns granular messages so the form just displays whatever it gets.

### Section 4 — OnboardingForm tweak

Today: handle input starts as `useState("")`. Change to: `useState(initialHandle)` where `initialHandle` is passed as a prop from the page server component.

```tsx
// app/app/onboarding/OnboardingForm.tsx
interface Props {
  initialFilms: DbFilm[];
  initialHandle: string; // from profile.handle, pre-filled in the input
}

export default function OnboardingForm({ initialFilms, initialHandle }: Props) {
  const [handle, setHandle] = useState(initialHandle);
  ...
}
```

```tsx
// app/app/onboarding/page.tsx
const { data: profile } = await supabase
  .from("profiles")
  .select("handle")
  .eq("id", user.id)
  .single();
return <OnboardingForm initialFilms={films} initialHandle={profile?.handle ?? ""} />;
```

Validation, submit, server action all unchanged.

### Section 5 — `_completeOnboarding` tweak

Today: `update({ handle, display_name: handle, broadcast_watchlist_adds: true, onboarded_at })`.

Change: drop `display_name` from the update. The trigger already set display_name correctly (from metadata for password signups, from auto-handle for OAuth). If the user changes their handle in onboarding, their display_name doesn't follow — the user's first-impression display_name stays. They can edit display_name in `/settings` if they want to.

Rationale: today's `display_name = handle` line was a backstop for "we don't know what their display_name should be." Now we know — it was set at signup. Don't clobber it.

```ts
// after
const { error: pErr } = await client
  .from("profiles")
  .update({
    handle,
    broadcast_watchlist_adds: true,
    onboarded_at: new Date().toISOString(),
  })
  .eq("id", user.id);
```

The test `app/tests/actions/onboarding.test.ts` asserts `p.data?.handle === "moss.witch"` — still passes. The test doesn't assert display_name today; if we want to add an assertion, it'd be `expect(p.data?.display_name).not.toBe("moss.witch")` (display_name should reflect what was set at signup, which the test setup may or may not arrange).

### Section 6 — Migration order

Single PR. Order of edits:

1. Apply migration `0136` to prod (trigger update).
2. Update `signUp` action.
3. Update `/auth/signup/page.tsx` form.
4. Update `OnboardingForm.tsx` to accept `initialHandle` prop.
5. Update `app/app/onboarding/page.tsx` to fetch profile + pass `initialHandle`.
6. Update `_completeOnboarding` to drop the `display_name` update.
7. Run `npm run typecheck` + `npm run build`.
8. Visual QA: sign up a fresh user with a display name like "Tooth Tony" — handle auto-suggests "toothtony" — submit — confirm email — land on /onboarding — handle field pre-filled with "toothtony" — complete onboarding — verify @handle on profile page.
9. OAuth QA: sign up via Google — land on /onboarding — handle field pre-filled with auto-generated handle — edit if desired — complete.

### Section 7 — Risks and follow-ups

**Risk: race-condition on uniqueness pre-check.** Two users submit the signup form simultaneously with the same handle. Pre-check passes for both. Auth.users INSERT fires. Trigger tries to insert profiles with the same handle. The unique index throws on the second one. The second user sees a generic signup error. Acceptable rare edge case; the failure mode is "try a different handle."

**Risk: trigger metadata path skips suffix-loop.** Intentional — uniqueness was pre-checked. If the unique index throws because of a race or a stale pre-check, the auth.users INSERT fails. We don't auto-suffix because it'd give the user a different handle than they typed (worse UX than failing).

**Risk: existing users with `display_name = handle`.** Their visible name in the UI is still their handle. They can edit display_name in `/settings`. No backfill is needed.

**Risk: OAuth users still go through legacy auto-handle path.** They land on /onboarding with an auto-generated handle in the field. They can edit it before submit. Same as today's behavior, just with a pre-filled value.

**Follow-ups deliberately not in this PR:**
- Live handle-availability check on signup (debounced).
- Display_name validation in `/settings`.
- A "this handle is taken" suggestion engine (e.g., "toothtony was taken; try toothtony2 or tooth.tony").
- Handle change history (`/settings` updates handle in place; no audit trail).
- Lowercase-coercion-on-input (today the form rejects uppercase; we could auto-lowercase as user types for nicer UX).
- A `username_changes` table to limit how often a user can change their handle.

### Section 8 — Done definition

- Signup form has Display Name + Handle inputs after Email + Password.
- Handle auto-suggests from display_name; locks on manual edit.
- Submitting with an invalid handle, taken handle, or empty display_name surfaces the right error.
- A successful signup with handle="toothtony", display_name="Tooth Tony" produces a profile row with both fields set correctly — verified via DB query.
- OAuth signup still works; handle auto-generates from email (existing trigger fallback path).
- /onboarding handle field is pre-filled.
- `_completeOnboarding` no longer sets `display_name = handle`.
- Typecheck + build green.

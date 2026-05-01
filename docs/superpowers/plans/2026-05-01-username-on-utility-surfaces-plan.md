# Username on utility surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `display_name ?? username` (and `display_name || username`) with bare `username` on every utility surface — feed rows, comments, notifications, /coven, top-nav, search, likers list. `display_name` continues to render only on `/p/[username]`'s h1 + main avatar, and the /settings input remains editable.

**Architecture:** Pure UI replacement. No schema, no migration, no types change. The `display_name` column is still selected by all existing queries; only its render is removed from utility surfaces. The Avatar `name` prop on those surfaces also flips to `username` so the fallback initial letter stays consistent with the rendered text.

**Tech Stack:** Next.js 15 App Router, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-01-username-on-utility-surfaces-design.md`

**Branch (already created):** `feature/username-on-utility-surfaces`

---

## File Structure

**Modified — flipping (~17 files):**

Activity feed components (Task 1):
- `app/components/activity/ActivityWatchlistAdded.tsx`
- `app/components/activity/ActivityWatchLogged.tsx`
- `app/components/activity/ActivityRecommendationSent.tsx`
- `app/components/activity/ActivityListCreated.tsx`
- `app/components/activity/ActivityListFilmAdded.tsx`
- `app/components/activity/ActivityReviewPublished.tsx`
- `app/components/activity/ActivityCovenJoined.tsx`
- `app/components/activity/ActivityLibraryAdded.tsx`
- `app/components/activity/ActivityWatchlistAddedGroup.tsx`
- `app/components/activity/ActivityWatchLoggedGroup.tsx`

Other components + pages (Task 2):
- `app/components/LikersBottomSheet.tsx`
- `app/components/SearchPersonRow.tsx`
- `app/components/TopNavChrome.tsx`
- `app/components/notifications/NotificationRow.tsx`
- `app/components/notifications/NotificationGroupRow.tsx`
- `app/app/coven/page.tsx`
- `app/app/p/[username]/page.tsx` (line 88 only — line 59/64 stay)

**Untouched (explicitly):**
- `app/app/settings/SettingsForm.tsx` (user's own preview)
- `app/app/admin/users/*` (admin labeled fields)
- `app/components/RecommendModal.tsx` (display_name appears as a prop name, not a render)
- `app/components/CommentSheet.tsx` / `CommentList.tsx` / `ActivityFooter.tsx` (already on username post-#84)
- All query/action files (still select `display_name`)
- `app/lib/supabase/types.ts`

---

### Task 1: Activity feed components

**Files (10):** all under `app/components/activity/`. The replacement rule is identical for every file: drop the `display_name ?? ` prefix from every `display_name ?? username` expression, leaving bare `username`. Both the `Avatar name={...}` prop and the visible `<Link>` text get the same treatment.

- [ ] **Step 1: Edit `ActivityWatchlistAdded.tsx`**

Replace BOTH occurrences (line 12 and line 15 in current file):

```diff
-      <Avatar name={item.actor.display_name ?? item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
+      <Avatar name={item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
```
```diff
-          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.username}</Link>
+          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
```

- [ ] **Step 2: Edit `ActivityWatchLogged.tsx`**

Same two-edit pattern as Step 1: lines 12 and 15. Drop `item.actor.display_name ?? ` from both.

- [ ] **Step 3: Edit `ActivityRecommendationSent.tsx`**

Three edits. Lines 12 + 15 (actor) and line 19 (recipient):

```diff
-      <Avatar name={item.actor.display_name ?? item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
+      <Avatar name={item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
```
```diff
-          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.username}</Link>
+          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
```
```diff
-          <Link href={`/p/${encodeURIComponent(item.recipient.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.recipient.display_name ?? item.recipient.username}</Link>.
+          <Link href={`/p/${encodeURIComponent(item.recipient.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.recipient.username}</Link>.
```

- [ ] **Step 4: Edit `ActivityListCreated.tsx`**

Two edits, lines 11 + 14. Drop `item.actor.display_name ?? ` from both.

- [ ] **Step 5: Edit `ActivityListFilmAdded.tsx`**

Two edits, lines 12 + 15. Drop `item.actor.display_name ?? ` from both.

- [ ] **Step 6: Edit `ActivityReviewPublished.tsx`**

Two edits, lines 12 + 15. Drop `item.actor.display_name ?? ` from both.

- [ ] **Step 7: Edit `ActivityCovenJoined.tsx`**

Three edits, lines 11 + 14 (actor) + 16 (other):

```diff
-      <Avatar name={item.actor.display_name ?? item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
+      <Avatar name={item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
```
```diff
-          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.username}</Link>
+          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
```
```diff
-          <Link href={`/p/${encodeURIComponent(item.other.username)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{item.other.display_name ?? item.other.username}</Link>
+          <Link href={`/p/${encodeURIComponent(item.other.username)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{item.other.username}</Link>
```

- [ ] **Step 8: Edit `ActivityLibraryAdded.tsx`**

Two edits, lines 12 + 15. Drop `item.actor.display_name ?? ` from both.

- [ ] **Step 9: Edit `ActivityWatchlistAddedGroup.tsx`**

Two edits. The Avatar `name` prop (line 31) and the `<Link>` text (line 43):

```diff
-          name={actor.display_name ?? actor.username}
+          name={actor.username}
```
```diff
-              {actor.display_name ?? actor.username}
+              {actor.username}
```

- [ ] **Step 10: Edit `ActivityWatchLoggedGroup.tsx`**

Same pattern as Step 9 (lines 29 + 41). Drop `actor.display_name ?? ` from both.

- [ ] **Step 11: Typecheck**

Run from `/Users/christophernowacki/film-goblin/app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 12: Commit**

From repo root `/Users/christophernowacki/film-goblin`:
```
git add app/components/activity/ActivityWatchlistAdded.tsx app/components/activity/ActivityWatchLogged.tsx app/components/activity/ActivityRecommendationSent.tsx app/components/activity/ActivityListCreated.tsx app/components/activity/ActivityListFilmAdded.tsx app/components/activity/ActivityReviewPublished.tsx app/components/activity/ActivityCovenJoined.tsx app/components/activity/ActivityLibraryAdded.tsx app/components/activity/ActivityWatchlistAddedGroup.tsx app/components/activity/ActivityWatchLoggedGroup.tsx
git commit -m "feat(activity): standardize on username for feed components"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle (per CLAUDE.md gotcha).

---

### Task 2: Other components + pages

**Files (7):** components and two pages. Each file has its own replacement rule because the surrounding chains differ.

- [ ] **Step 1: Edit `app/components/LikersBottomSheet.tsx`**

This file uses `||` (logical OR), not `??`. Same intent — drop the `display_name` half. Two edits at lines 22 and 27:

```diff
-        name={p.display_name || p.username}
+        name={p.username}
```
```diff
-        <div className="liker-row-name">{p.display_name || p.username}</div>
+        <div className="liker-row-name">{p.username}</div>
```

- [ ] **Step 2: Edit `app/components/SearchPersonRow.tsx`**

Two edits at lines 64 and 67:

```diff
-        <Avatar name={profile.display_name ?? profile.username} color="var(--accent)" size={48} url={profile.avatar_url} />
+        <Avatar name={profile.username} color="var(--accent)" size={48} url={profile.avatar_url} />
```
```diff
-          <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
-            {profile.display_name ?? profile.username}
-          </div>
+          <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
+            {profile.username}
+          </div>
```

- [ ] **Step 3: Edit `app/components/TopNavChrome.tsx`**

One edit at line 56. Drop the `display_name` link in the chain; keep the terminal `?? "You"` (used while the profile fetch is in flight).

```diff
-                displayName={profile?.display_name ?? profile?.username ?? "You"}
+                displayName={profile?.username ?? "You"}
```

- [ ] **Step 4: Edit `app/components/notifications/NotificationRow.tsx`**

Two edits, lines 36 and 78. Drop the `display_name` link only; keep the terminal `?? "Someone"` / `?? "system"` fallbacks.

```diff
-  const actorName = n.actor?.display_name ?? n.actor?.username ?? "Someone";
+  const actorName = n.actor?.username ?? "Someone";
```
```diff
-        name={notification.actor?.display_name ?? notification.actor?.username ?? "system"}
+        name={notification.actor?.username ?? "system"}
```

- [ ] **Step 5: Edit `app/components/notifications/NotificationGroupRow.tsx`**

Two edits, lines 16 and 76. Same rule.

```diff
-  const actorName = group.actor?.display_name ?? group.actor?.username ?? "System";
+  const actorName = group.actor?.username ?? "System";
```
```diff
-          name={group.actor?.display_name ?? group.actor?.username ?? "system"}
+          name={group.actor?.username ?? "system"}
```

- [ ] **Step 6: Edit `app/app/coven/page.tsx`**

Five edits across the file at lines 80, 91, 124, 132, 144:

```diff
-                    name={inv.from.display_name ?? inv.from.username}
+                    name={inv.from.username}
```
```diff
-                        {inv.from.display_name ?? inv.from.username}
+                        {inv.from.username}
```
```diff
-                          name={m.display_name ?? m.username}
+                          name={m.username}
```
```diff
-                              {m.display_name ?? m.username}
+                              {m.username}
```
```diff
-                          otherDisplayName={m.display_name ?? m.username}
+                          otherDisplayName={m.username}
```

(The `otherDisplayName` prop name on `LeaveCovenButton` is left as-is; only the value flips. The component receives a string and uses it for confirmation copy — passing `m.username` is correct.)

- [ ] **Step 7: Edit `app/app/p/[username]/page.tsx`**

ONE edit at line 88 (the coven-member chip Avatar). Lines 59 and 64 are EXPLICITLY UNTOUCHED — they keep `display_name ?? username` for the profile h1 + main avatar.

```diff
-                  <Avatar name={m.display_name ?? m.username} color="var(--accent)" size={56} url={m.avatar_url} />
+                  <Avatar name={m.username} color="var(--accent)" size={56} url={m.avatar_url} />
```

- [ ] **Step 8: Typecheck**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 9: Run full test suite**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: PASS (109 passed / 58 skipped, same shape as last run after sub-project #25). No tests assert these specific render strings, so no fixtures should need updating.

If any test fails because it specifically asserted a `display_name`-derived string in rendered output, STOP and report — that would be a real regression worth examining.

- [ ] **Step 10: Commit**

From repo root:
```
git add app/components/LikersBottomSheet.tsx app/components/SearchPersonRow.tsx app/components/TopNavChrome.tsx app/components/notifications/NotificationRow.tsx app/components/notifications/NotificationGroupRow.tsx app/app/coven/page.tsx app/app/p/[username]/page.tsx
git commit -m "feat(ui): standardize on username for utility surfaces"
```

---

### Task 3: Sanity grep

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm no `display_name ?? username` remains on utility surfaces**

Run from repo root:
```
grep -rn "display_name ?? \|display_name || " app/ --include='*.tsx' --include='*.ts' | grep -v "/tests/"
```

Expected output — only these three lines (the explicit "kept" sites):
- `app/app/p/[username]/page.tsx:59` — main avatar on profile h1
- `app/app/p/[username]/page.tsx:64` — profile h1
- `app/app/settings/SettingsForm.tsx:159` — user's own preview avatar

If MORE lines appear, an edit was missed — go back to the relevant Task 1 or 2 step. If FEWER lines appear, one of the kept sites was clobbered — restore it.

- [ ] **Step 2: No commit needed** — verification only.

---

### Task 4: Update CLAUDE.md and open PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a sub-project #26 row to the Sub-project history table in CLAUDE.md**

Open `CLAUDE.md`. Find the Sub-project history table (look for `| 25 | Comment sheet polish + likes`). Add this row after #25:

```markdown
| 26 | Username on utility surfaces — flipped ~30 render sites from `display_name ?? username` to bare `username`. `/p/[username]` h1 + main avatar still use `display_name ?? username`; /settings Display name input still editable; admin surfaces unchanged. No schema, no migration. | `2026-05-01-username-on-utility-surfaces-design.md` |
```

Also update the "Last updated" line at the top:

```markdown
**Last updated:** 2026-05-01 (comment sheet polish + likes #25, then username on utility surfaces #26)
```

- [ ] **Step 2: Commit CLAUDE.md**

```
git add CLAUDE.md
git commit -m "docs(claude): note sub-project #26 — username on utility surfaces"
```

- [ ] **Step 3: Push branch**

```
git push -u origin feature/username-on-utility-surfaces
```

- [ ] **Step 4: Open PR**

Write the body to `/tmp/pr-body-26.md`:

```markdown
## Summary

Sub-project #26. Standardize on `username` for all utility surfaces (feed rows, comments, notifications, /coven, top-nav, search, likers, profile coven chips). `display_name` continues to render only on `/p/[username]`'s h1 + main avatar. /settings Display name input remains editable. Admin surfaces unchanged.

- ~30 render sites flipped across 17 files. No schema, no migration, no types change.
- `Avatar name={...}` props on flipped surfaces also flip to `username` so the fallback initial letter matches what's rendered below.
- Visible behavior change: a user with custom display_name = "Tony T." (username "teethtony") now sees "teethtony" in feed rows / comments / notifications. Profile h1 still says "Tony T."

## Test plan

- [x] `cd app && npm run typecheck`
- [x] `cd app && npm test` — 109 passed / 58 skipped, no fixture changes
- [x] Grep confirms only 3 `display_name ?? username` sites remain (profile h1 + main avatar + /settings preview)
- [ ] Manual smoke on Vercel preview: feed, /coven, notifications dropdown, top-nav user menu, search results, likers sheet — all show bare username. /p/[username] h1 still shows display_name when set. /settings still has editable Display name input.
```

Then run:
```
gh pr create --title "feat: username on utility surfaces; display_name only on profile h1" --body-file /tmp/pr-body-26.md
```

- [ ] **Step 5: Done.** Report PR URL back.

---

## Self-Review

**1. Spec coverage:**
- Activity feed components → Task 1, Steps 1–10
- LikersBottomSheet, SearchPersonRow, TopNavChrome, Notification rows, /coven, /p/[username] line 88 → Task 2, Steps 1–7
- /p/[username] h1 + main avatar EXPLICITLY untouched → reaffirmed in Task 2 Step 7 + Task 3 grep
- /settings, /admin, RecommendModal EXPLICITLY untouched → reaffirmed in Task 3 grep
- Test pass + commit strategy → Task 1 Step 12 + Task 2 Step 10
- CLAUDE.md update + PR → Task 4

All spec sections covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "fill in details" patterns. Every diff block shows the exact replacement.

**3. Type consistency:**
- All replacements drop the same prefix `<obj>.display_name ?? `, leaving the rest unchanged.
- `username` is `string` (non-null) on every actor / member / profile / recipient / `m` / `inv.from` / `n.actor.username` (where the latter has `?.username` — the optional chain is preserved).
- The terminal `?? "Someone"` / `?? "system"` / `?? "System"` / `?? "You"` / `?? "you"` literals are explicitly preserved everywhere they appear.

No drift detected.

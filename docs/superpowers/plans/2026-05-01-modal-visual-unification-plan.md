# Modal Visual Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `RecommendModal` to use `BottomSheet` and restyle `AvatarEditor`'s panel to match the dark `#141414` + accent-top-border + serif-title visual language established by `CommentSheet` (sub-project #25).

**Architecture:** Two component-local rewrites. No new primitive, no API changes, no schema. `BottomSheet.title` already accepts `ReactNode` (sub-project #25 widening); the ritual copy moves into the title slot. `AvatarEditor` keeps its centered-overlay shape because the cropper needs vertical real estate; only the panel chrome changes. A pre-existing sent-state-on-reopen bug in `RecommendModal` is fixed in passing.

**Tech Stack:** Next.js 15 App Router, TypeScript, react-easy-crop (existing dep).

**Spec:** `docs/superpowers/specs/2026-05-01-modal-visual-unification-design.md`

**Branch (already created):** `feature/modal-visual-unification`

---

## File Structure

**Modified (2):**
- `app/components/RecommendModal.tsx` — full rewrite. Drops the rotated zine-card overlay, retones the form for the dark panel, fixes the sent-state cache bug.
- `app/components/AvatarEditor.tsx` — panel restyle only. Component shape, cropper logic, props, and call signature stay the same.

**Untouched:**
- `app/components/BottomSheet.tsx` — already correct.
- `app/app/globals.css` — no new classes.
- All call sites of these modals (`app/app/film/[id]/page.tsx`, `app/app/settings/SettingsForm.tsx`).
- Admin modals (`RetireModal`, `DeleteUserModal`).
- `WatchModal`, `CommentSheet`, `LikersBottomSheet`.
- The `.btn-dark` CSS class — still used by auth pages and TopNavChrome; just stop using it on RecommendModal's Submit.

---

### Task 1: Rewrite `RecommendModal` as a `BottomSheet`

**Files:**
- Modify: `app/components/RecommendModal.tsx`

- [ ] **Step 1: Replace the entire file**

Open `/Users/christophernowacki/film-goblin/app/components/RecommendModal.tsx`. Replace its full contents with:

```typescript
"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";
import { useToast } from "./ToastProvider";
import BottomSheet from "./BottomSheet";

interface CovenMember {
  id: string;
  username: string;
  display_name: string | null;
}

interface Props {
  filmId: string;
  filmTitle: string;
  covenMembers: CovenMember[];
}

export default function RecommendModal({ filmId, filmTitle, covenMembers }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function close() {
    setOpen(false);
    // Reset transient state so the next open shows a fresh form, not a
    // cached "Sent." or stale error.
    setSent(false);
    setError(null);
    setNote("");
  }

  async function send(formData: FormData) {
    start(async () => {
      setError(null);
      try {
        const toUserId = String(formData.get("to_user_id") || "");
        if (!toUserId) { setError("Pick a coven member."); return; }
        const noteVal = String(formData.get("note") || "");
        await recommendFilm(filmId, toUserId, noteVal);
        setSent(true);
        toast("Recommendation sent");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span>Cast the Rune</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {filmTitle}
      </span>
    </span>
  );

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {covenMembers.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5, padding: "12px 0" }}>
          You have no coven yet. Visit <a href="/coven" style={{ color: "var(--accent)", textDecoration: "underline" }}>/coven</a> to bind with someone, then come back.
        </div>
      ) : sent ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", padding: "12px 0" }}>
          Sent. They&rsquo;ll see it in their feed.
        </div>
      ) : (
        <form action={send} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0 4px" }}>
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>Coven Member</div>
            <select
              name="to_user_id"
              required
              defaultValue=""
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: "10px 12px",
                fontFamily: "var(--font-ui)",
                fontSize: 16,
              }}
            >
              <option value="" style={{ background: "#141414" }}>Choose someone…</option>
              {covenMembers.map(m => (
                <option key={m.id} value={m.id} style={{ background: "#141414" }}>
                  @{m.username}{m.display_name ? ` · ${m.display_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>A Whisper</div>
            <textarea
              name="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: 10,
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                resize: "none",
                outline: "none",
              }}
            />
          </div>
          {error && (
            <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {pending ? "Sealing…" : "✦ Seal & Send"}
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
```

Key differences from the old file:
- Imports `BottomSheet` and `useToast`. Drops the manual `position: fixed` overlay JSX.
- Adds a `close()` function that resets `sent`/`error`/`note` so reopening shows a fresh form (the spec's bundled bug fix).
- Title is a `ReactNode` mirroring the CommentSheet header pattern: serif `Cast the Rune`, accent dot, `var(--muted)` filmTitle.
- Form inputs retoned for the dark panel: `background: transparent`, `color: var(--bone)`, `border: 1px solid var(--muted)`. `<option>` rows get explicit `background: #141414` so the native picker reads correctly on iOS.
- Submit button uses `.btn` (solid pink pill) instead of `.btn-dark` — consistent with CommentComposer's smart Post.
- Trigger button (closed state) is unchanged.
- `toast("Recommendation sent")` was already added in PR #93; preserved here.

- [ ] **Step 2: Typecheck**

Run from `/Users/christophernowacki/film-goblin/app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 113 passed / 58 skipped. No suite asserts the recommend modal's rendering; nothing should regress.

- [ ] **Step 4: Commit**

From repo root `/Users/christophernowacki/film-goblin`:
```
git add app/components/RecommendModal.tsx
git commit -m "feat(recommend): convert RecommendModal to BottomSheet"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle (per CLAUDE.md gotcha).

---

### Task 2: Restyle `AvatarEditor`'s panel

**Files:**
- Modify: `app/components/AvatarEditor.tsx`

- [ ] **Step 1: Restyle the panel**

Open `/Users/christophernowacki/film-goblin/app/components/AvatarEditor.tsx`. Find the JSX block starting at `return (` (around line 69). Replace it with:

```tsx
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(10,10,10,0.92)",
      display: "grid", placeItems: "center", zIndex: 200, padding: 20,
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#141414",
        color: "var(--bone)",
        borderTop: "2px solid var(--accent)",
        borderRadius: 16,
        maxWidth: 520,
        width: "100%",
        padding: "var(--modal-pad)",
      }}>
        <h2 className="head" style={{ fontSize: 28, margin: "0 0 16px", lineHeight: 1 }}>
          Frame the portrait
        </h2>

        <div style={{
          position: "relative",
          width: "100%",
          height: 340,
          background: "#0A0A0A",
          border: "1px solid var(--muted)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: "#0A0A0A" },
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <span className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "var(--bone)",
              border: "1px solid var(--muted)",
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!pixelArea || saving}
            className="btn"
            style={{ padding: "10px 16px" }}
          >
            {saving ? "Saving…" : "✦ Save"}
          </button>
        </div>
      </div>
    </div>
  );
```

Key differences from the old JSX:
- Backdrop bumped to `rgba(10,10,10,0.92)` + `backdrop-filter: blur(4px)` (matches `.bottom-sheet-overlay` from globals.css).
- Panel: `#141414` background, `var(--bone)` text, `2px solid var(--accent)` top border, `borderRadius: 16`. Drops `var(--bone)` panel + `3px solid var(--void)` border + accent corner shadow + `grain-light` paper texture.
- Title: single serif h2 ("Frame the portrait") replacing the prior `eyebrow` + `display`-class h2 pair.
- Cropper wrapper retoned: `#0A0A0A` background, `1px solid var(--muted)` border, soft 4px corner radius. The `containerStyle` on `<Cropper>` ensures the Cropper's own background is dark too — addresses the spec's risk-register concern about overlay opacity.
- Zoom label: `var(--muted)` instead of an implicit dark-on-light contrast.
- Cancel button: `1px solid var(--muted)`, transparent, bone text. Square-ish. Subordinate visually to Save.
- Save button: existing `.btn` solid-pink-pill — consistent with RecommendModal's Submit and CommentComposer's Post. Drops the custom `padding: 10px 16px; background: var(--void); color: var(--bone)` styling.

The component's logic, props, hooks, and export shape are unchanged. Only the JSX body of the `return (...)` block changes.

- [ ] **Step 2: Typecheck**

```
cd /Users/christophernowacki/film-goblin/app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Run full test suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 113 passed / 58 skipped.

- [ ] **Step 4: Commit**

```
git add app/components/AvatarEditor.tsx
git commit -m "feat(avatar-editor): adopt dark-panel + accent-border visual language"
```

---

### Task 3: Manual smoke verification

**Files:** none modified — verification only.

- [ ] **Step 1: Start dev server**

```
cd /Users/christophernowacki/film-goblin/app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```
Expected: dev server up at http://localhost:3000.

- [ ] **Step 2: Smoke `RecommendModal`**

In a logged-in browser session:
- Navigate to any `/film/[id]` page where you have ≥1 coven member.
- Click the `✦ Recommend To A Coven Member` button.
- Confirm: bottom sheet slides up from the bottom on both mobile and desktop. Header reads `Cast the Rune • <film title>` with the accent-pink dot separator. Form body renders on the dark panel: muted-bordered select, muted-bordered textarea, solid-pink Seal & Send button.
- Pick a coven member, type a whisper, submit.
- Confirm: the form is replaced by the serif-italic "Sent. They'll see it in their feed." message AND a `Recommendation sent` toast pill animates from the bottom.
- Close via the `×` close button.
- Reopen the modal → confirm the form is FRESH (no cached "Sent." state). This validates the bundled bug fix.
- Try submitting with no coven member selected → confirm the inline blood-red "Pick a coven member." error renders.

- [ ] **Step 3: Smoke `AvatarEditor`**

In the same session:
- Navigate to `/settings`.
- Click the avatar's `Upload` (or `Replace`) label, pick an image.
- Confirm: AvatarEditor pops as a centered overlay. Backdrop is dark with a subtle blur. Panel is dark `#141414` with a 2px accent-pink top border and `border-radius: 16`. Title reads `Frame the portrait` in serif.
- Confirm: the cropper's circular crop overlay is visible (the `containerStyle: { background: '#0A0A0A' }` ensures the dimming is legible against the dark panel).
- Drag/zoom the image, confirm the cropper is interactive.
- Click Cancel → modal closes without uploading.
- Reopen, click Save → confirm the upload completes, the avatar updates, the `Avatar updated` toast fires.

- [ ] **Step 4: Stop dev server**

Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 5: No commit needed.** Verification only.

If any of the smoke checks fail, STOP and fix before continuing to Task 4. Most likely failure: the cropper overlay is too dim against the dark panel. Mitigation noted in the spec — adjust `Cropper`'s `style.containerStyle` further (e.g. add a slightly lighter `background` or tweak `cropShape` mask opacity via CSS).

---

### Task 4: Update CLAUDE.md + push + open PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append sub-project #28 row**

Open `/Users/christophernowacki/film-goblin/CLAUDE.md`. Find the link to `docs/sub-project-history.md` (which is now where the table lives, per PR #88). Open `/Users/christophernowacki/film-goblin/docs/sub-project-history.md` and append at the end of the table:

```markdown
| 28 | Modal visual unification — `RecommendModal` converts to `BottomSheet` (drops the rotated zine-card overlay; ritual copy "Cast the Rune • {filmTitle}" moves into the sheet header). `AvatarEditor` keeps its centered fullscreen overlay but adopts the dark `#141414` + accent top border + serif title visual language. Form inputs retoned for dark panels; Submit unified to `.btn` solid-pink. Bundled fix: RecommendModal sent-state now resets on close. | `2026-05-01-modal-visual-unification-design.md` |
```

- [ ] **Step 2: Update CLAUDE.md "Last updated"**

```markdown
**Last updated:** 2026-05-01 (sub-projects #25–#28 — comment polish+likes, username standardization, like_on_comment notification, modal visual unification)
```

- [ ] **Step 3: Commit CLAUDE.md + history file**

```
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs(claude): note sub-project #28 — modal visual unification"
```

- [ ] **Step 4: Push branch**

```
git push -u origin feature/modal-visual-unification
```

- [ ] **Step 5: Open PR**

Write the PR body to `/tmp/pr-body-28.md`:

```markdown
## Summary

Sub-project #28 — modal visual unification.

- **`RecommendModal`** converts to `BottomSheet`. Drops the rotated zine-card overlay (`transform: rotate()` + bone-paper panel + accent corner shadow + `grain-light`). Ritual copy `Cast the Rune • {filmTitle}` moves into the sheet's title slot, mirroring CommentSheet's `Comments • 24` pattern. Form inputs retoned for the dark panel (transparent backgrounds, muted borders, bone text). Submit button unified to `.btn` solid-pink-pill (was `.btn-dark`).
- **`AvatarEditor`** keeps its centered fullscreen overlay (the cropper needs the vertical real estate) but adopts the BottomSheet visual tokens: `#141414` panel, `2px solid var(--accent)` top border, `border-radius: 16`, single serif h2 title `Frame the portrait`. Backdrop bumped to match `.bottom-sheet-overlay`'s blur. Cropper background tuned for legible overlay against the dark panel.
- **Bundled fix:** `RecommendModal`'s sent-state now resets on close, so reopening after a successful send shows a fresh form instead of the cached "Sent." message.
- Admin modals (`RetireModal`, `DeleteUserModal`) explicitly out of scope and unchanged.

## Test plan

- [x] `cd app && npm run typecheck`
- [x] `cd app && npm test` — 113 passed / 58 skipped
- [x] Manual smoke on dev: RecommendModal opens, sends, resets on reopen; AvatarEditor renders with dark panel + accent border, cropper interactive, save uploads.
- [ ] Manual smoke on Vercel preview after merge: confirm both surfaces on iOS PWA standalone (safe-area + notch).
```

Then run:
```
gh pr create --title "feat: modal visual unification — RecommendModal → BottomSheet, AvatarEditor restyle" --body-file /tmp/pr-body-28.md
```

- [ ] **Step 6: Done.** Report PR URL back to the controller.

---

## Self-Review

**1. Spec coverage:**
- Spec §"`RecommendModal.tsx`" — Task 1.
- Spec §"`AvatarEditor.tsx`" — Task 2.
- Spec §"Brand-voice retention" — handled inside Tasks 1 & 2 (`Cast the Rune` and `Frame the portrait` survive in titles).
- Spec §"Risk register / cropper overlay opacity on dark panel" — Task 2 sets `Cropper`'s `containerStyle` and the cropper wrapper background to `#0A0A0A`; Task 3 verifies on dev.
- Spec §"Risk register / sheet height for RecommendModal" — implicit (uses BottomSheet's existing `maxHeight: 70dvh` from CommentSheet); no special handling.
- Spec §"Risk register / sent-state reset bug" — Task 1 Step 1 includes the `close()` reset.
- Spec §"Risk register / .btn-dark retirement" — verified `btn-dark` is still used by 6 other call sites; not removed, only stopped using on RecommendModal Submit.
- Spec §"Tests" — Tasks 1 Step 3, Task 2 Step 3, Task 3 Steps 2–3.

All spec sections covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N" markers. Every code block is the literal replacement content. Manual smoke checklist is concrete (specific routes, specific button labels, specific text-to-confirm).

**3. Type consistency:**
- `useToast` import path `./ToastProvider` matches Task 1's RecommendModal import and the existing usage in CovenButton, CommentSheet etc.
- `BottomSheet` import path `./BottomSheet` matches existing usage from `CommentSheet` / `LikersBottomSheet` / `WatchModal`.
- The `close` function name is consistent within Task 1 (defined and referenced by `onClose={close}`).
- The `Cropper` import in Task 2's body assumes the existing `import Cropper, { Area } from "react-easy-crop";` line at the top of `AvatarEditor.tsx` is preserved (it is — only the JSX inside `return (...)` is being replaced).

No drift detected.

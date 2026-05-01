# Modal visual unification

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #28

## Background

Sub-project #25 restyled the comment bottom sheet to a polished pattern: dark `#141414` panel, `var(--accent)` top border, `border-radius: 16px 16px 0 0`, serif title with accent-dot separator, escape-to-close, body-scroll lock, safe-area aware. The `BottomSheet` primitive was already in place from earlier work; #25 widened its `title` prop to accept `ReactNode`.

Three other modal/dialog surfaces still exist:

- **`CommentSheet`, `LikersBottomSheet`, `WatchModal`** — already use `BottomSheet`. No work needed.
- **`RecommendModal`** — its own modal: centered overlay, rotated zine card (`transform: rotate(var(--card-rotation))`), `var(--bone)` panel, accent corner shadow, `✦ Cast The Rune ✦` eyebrow.
- **`AvatarEditor`** — same rotated zine card pattern: centered overlay, bone-colored panel, accent shadow, `✦ Frame the Portrait` eyebrow, `grain-light` paper texture.

The rotated card looks distinctive on desktop and reads as charming there. On mobile it doesn't slide up, doesn't respect the safe area, and the `transform: rotate()` makes the panel feel cramped against the screen edges. The serif title + accent dot pattern from the comment sheet feels more polished and works equally on both platforms.

This sub-project unifies the visual language. The brand voice (`Cast the Rune`, `Frame the Portrait`, the `✦` glyph) survives; the rotated-card-with-paper-texture container is retired.

## Goals

- `RecommendModal` becomes a `BottomSheet`. Body form unchanged, ritual copy moves into the sheet's title slot.
- `AvatarEditor` adopts the BottomSheet visual tokens (dark panel, accent top border, serif title) but stays a centered fullscreen overlay because the cropper needs vertical real estate.
- No new primitive. No `<Modal>`/`<Sheet>` API unification — two surfaces don't justify it.
- No changes to `CommentSheet`, `LikersBottomSheet`, `WatchModal`, or the admin modals (`RetireModal`, `DeleteUserModal` — those stay plain centered overlays for now).

## Non-goals

- Unifying the admin destructive-confirm modals into BottomSheet. They're admin-only, desktop-only, and a centered overlay reads correctly there.
- Replacing the `<button>✦ Recommend To A Coven Member</button>` trigger or any other call site that opens these modals.
- Changing the BottomSheet primitive's API. The `title: ReactNode` widening from sub-project #25 is sufficient.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| `RecommendModal` shape | Convert to `BottomSheet` | Form body fits comfortably in `maxHeight: 70dvh` |
| `AvatarEditor` shape | Keep centered fullscreen overlay; restyle panel only | Cropper's 340px image area would feel cramped in a sheet on iPhone SE |
| Title strategy | Serif "head" font + accent-dot separator + secondary detail (filmTitle for Recommend, omitted for Avatar) | Mirrors CommentSheet's "Comments • 24" |
| Ritual copy | Survives in the title — `Cast the Rune`, `Frame the portrait` | Personality lived in the copy, not the rotation |
| `✦` glyph | Stays inside the title as an inline accent if it reads well; drop if it crowds | Aesthetic call during impl |
| Brand panel paper texture (`grain-light`) | Dropped — conflicts with dark panel | Visual contradiction |
| Brand corner shadow + bone-on-void backdrop | Dropped | The dark `#141414` panel + accent top border carries enough chrome |
| Existing modal trigger button on `/film/[id]` | Untouched | Out of scope; only the modal contents change |

## Architecture

### `RecommendModal.tsx`

Full rewrite. The component still owns its open/close state and trigger button. The trigger button (currently `<button className="btn btn-lg">✦ Recommend To A Coven Member</button>`) is unchanged.

When `open === true`, render:

```tsx
<BottomSheet
  open={open}
  onClose={() => { setOpen(false); setSent(false); /* clear stale-sent */ }}
  title={
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span>Cast the Rune</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {filmTitle}
      </span>
    </span>
  }
>
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {/* existing form body, with input/select/textarea retoned for dark panel */}
  </div>
</BottomSheet>
```

Form body adjustments (the form already exists; only style tokens change):
- `<select>` and `<textarea>`: `background: transparent; color: var(--bone); border: 1px solid var(--muted)` instead of bone-on-void.
- Submit button: keep `.btn .btn-sm` solid-pink-pill style (consistent with CommentComposer's smart Post). Replace the existing `.btn-dark` variant.
- "Sent." sent-state copy stays. The `toast("Recommendation sent")` fires from the existing PR #93 work — toast and inline confirmation co-exist.
- The `eyebrow` line `✦ Cast The Rune ✦` is removed (replaced by sheet header).
- `display: 44px font-size; rotate-card-style title` — removed (replaced by sheet header).

A small bug fix bundled in (already noted in the prior chat): when the modal is closed via backdrop after a successful send, `sent` state currently persists. Reset it on close so the next open shows a fresh form. One-line addition to `onClose`.

### `AvatarEditor.tsx`

Component shape unchanged. Same `position: fixed; inset: 0; display: grid; place-items: center` overlay. Panel restyled.

Replace:
```tsx
<div ... style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
  maxWidth: 520, width: "100%", padding: "var(--modal-pad)",
}} className="grain-light">
  <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Frame the Portrait</div>
  <h2 className="display" style={{ fontSize: 36, margin: "0 0 14px", lineHeight: 0.9 }}>Crop and zoom</h2>
```

With:
```tsx
<div ... style={{
  background: "#141414", color: "var(--bone)",
  borderTop: "2px solid var(--accent)",
  borderRadius: 16,
  maxWidth: 520, width: "100%", padding: "var(--modal-pad)",
}}>
  <h2 className="head" style={{ fontSize: 28, margin: "0 0 14px", lineHeight: 1 }}>
    Frame the portrait
  </h2>
```

Drops:
- `grain-light` paper texture (conflicts with dark panel).
- The `eyebrow` line and the secondary `display`-class h2 — unified into one serif title.
- The `var(--card-shadow-offset)` accent corner shadow.
- The bone-paper background; `border: 3px solid var(--void)`.

Other token adjustments inside the editor:
- Cropper's wrapping div: `background: var(--void); border: 2px solid var(--void)` → `background: #0A0A0A; border: 1px solid var(--muted)` for subtler chrome on the dark panel.
- "Zoom" label: `caps`, `var(--bone)` (already implicit, but make sure no `var(--void)` is leaking).
- Cancel button: `border: 1px solid var(--muted); color: var(--bone); background: transparent`.
- Save button: `.btn .btn-sm` solid-pink-pill (consistent with CommentComposer / RecommendModal Submit).

### What does NOT change

- `BottomSheet` primitive — already correct.
- `CommentSheet`, `LikersBottomSheet`, `WatchModal` — already use `BottomSheet`.
- Admin modals (`RetireModal`, `DeleteUserModal`) — out of scope.
- Modal trigger buttons (the things that open these modals on `/film/[id]` and `/settings`).
- `globals.css` — no new classes needed.

## Brand-voice retention

The personality of the rotated cards lived primarily in:
1. The `✦`-bracketed eyebrow copy (`✦ Cast The Rune ✦`)
2. The ritual heading (`Recommend <em>{filmTitle}</em>`, `Crop and zoom`)
3. The `transform: rotate()` itself
4. The bone-paper-and-shadow physical-card metaphor

We retain (1) and (2) by promoting them into the BottomSheet's title slot. We drop (3) and (4) because they fight mobile UX. The serif `head` font + accent dot does enough chrome work on its own; the goblin voice rides the words, not the rotation.

## Risk register

- **Cropper overlay opacity on dark panel.** `react-easy-crop` renders a translucent dark overlay around the crop area. Today that overlay sits on top of bone paper; against `#141414` it'll look almost invisible. Likely needs a small `Cropper` style prop bump (e.g. `style={{ containerStyle: { background: '#0A0A0A' } }}`) or a custom CSS override. **Verify on device during impl.**
- **`maxHeight: 70dvh` on small phones.** RecommendModal's form body is ~280px (select + textarea + button). With sheet header ~80px and 12px gaps = ~380px. Comfortable on iPhone SE (667 × 70dvh = 467px). No risk.
- **Sent-state reset bug.** Pre-existing on `master` — modal closes via backdrop after send, reopen shows the cached "Sent." Bundled fix in this work, one line.
- **`.btn-dark` retirement on RecommendModal Submit.** Need to check if `.btn-dark` is used elsewhere; if not, can drop the class. If yes, leave it but stop using it on this Submit.

## Files affected

**Modified:**
- `app/components/RecommendModal.tsx` (full rewrite — drops ~30 lines, adds ~25 lines, net negative)
- `app/components/AvatarEditor.tsx` (panel/title restyle — ~15 lines changed)

**Untouched:**
- `app/components/BottomSheet.tsx` — already correct
- `app/app/globals.css` — no new classes
- All call sites of these modals (`/film/[id]`, `/settings`)
- Admin modals
- `WatchModal`, `CommentSheet`, `LikersBottomSheet`

## Tests

No automated tests assert these surfaces' visual rendering. Manual smoke on Vercel preview after merge:

- **`/film/[id]` while signed in with ≥1 coven member:** tap "Recommend To A Coven Member" → bottom sheet slides up from the bottom, header reads `Cast the Rune • <film title>`, form body renders on the dark panel, send a recommendation, see the existing "Sent." inline confirmation AND the toast from PR #93. Close the sheet, reopen → form is fresh (no cached "Sent.").
- **`/settings`:** click Upload (or Replace) avatar → AvatarEditor pops as a centered overlay with dark panel + accent top border, h2 reads "Frame the portrait" in serif, cropper works, Save and Cancel buttons read correctly. Verify the cropper overlay's dimming is visible against the dark panel.

Typecheck must pass. App test suite must remain at 113/171 (4 grouping specs + 109 misc).

## Open questions

None. All scope decisions locked.

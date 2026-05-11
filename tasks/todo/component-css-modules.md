---
title: Gradually move isolated component CSS to modules
owner: unclaimed
priority: medium
created: 2026-05-11
---

## Goal

Keep `globals.css` and `app/app/styles/*` focused on shared global primitives by
moving isolated component-owned styles into CSS Modules during normal component
work.

## Acceptance

- Do not do a giant style-only rewrite.
- Start with isolated families such as trailer embed, price stat block, comments,
  bottom sheet, film tags, and admin tag editor.
- Preserve visual output while moving each family.

## Notes

The global CSS file was mechanically split on 2026-05-11. That reduced file size
but did not eliminate global selector drift.

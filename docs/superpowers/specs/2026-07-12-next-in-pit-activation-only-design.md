# NEXT IN THE PIT — activation-only queue

## Problem

The return box is currently a general reminder surface. Price alerts, gazings, recommendations, and the Daily Omen can occupy it even when a member has not finished setting up their identity or social graph. That works against the box's more valuable job: helping a new or lightly connected member become recognizable and join a Coven.

## Decision

For now, NEXT IN THE PIT contains exactly three candidate kinds:

1. Pending incoming Coven invitations.
2. A missing-profile-photo reminder.
3. People ranked by the existing taste-twin compatibility model.

Invitations sort first because another person is waiting for an answer. The photo reminder sorts second because identity completion improves every social surface. Compatibility-ranked suggestions fill the remaining queue positions. The queue remains capped at five and retains its existing daily progress, carousel, swipe, and 24-hour **Set aside** behavior.

No price action, recommendation, gazing, Daily Omen, or other return-contract candidate may enter this surface. Those features remain available in their existing destinations and notifications.

## Interaction

- An incoming invitation can be accepted or declined directly in the box.
- A compatibility suggestion can be invited directly from the box. **Set aside** remains the non-destructive way to defer a suggestion.
- The photo reminder links directly to **Settings → Your Face**.
- Utility copy uses `@username`, not display name.
- Compatibility is used for ranking and explanation, but no uncalibrated percentage is shown.

## Data and security

The server query uses the signed-in caller's Supabase client and existing RLS-bound tables/actions. It reads only pending incoming `coven_requests`, active `return_contract_deferrals`, explicit public profile columns, and `getTasteTwinSuggestions`. No schema, grant, service-role, or environment change is required.

## Evidence

- Resolver tests prove the only three kinds and their priority.
- Query tests prove an empty completed profile produces no card, a missing avatar produces the reminder, and legacy source tables are not queried.
- Source/UI contracts prove inline Coven actions and the settings deep link remain wired.
- Run focused tests, the full app suite, typecheck, and production build.

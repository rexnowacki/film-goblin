# Two-Account Mobile Gazing Walkthrough

Use this checklist to verify the complete home-watch gazing loop on real devices. This is a
manual production smoke test, not a request to change production data directly.

## What you need

- Account A: the host.
- Account B: the invited attendee.
- Preferably two phones. One phone plus a private/incognito browser also works.
- Optional Account C: an unrelated signed-in user for the strongest privacy check.
- A film suitable for a temporary test watch.
- A distinctive but non-sensitive location note, such as `Test location — Apartment 4B`.

Do not use a real home address. Do not include the location note in screenshots that may be
shared publicly.

## Record before starting

- Date and local timezone:
- Account A username:
- Account B username:
- Optional Account C username:
- Film:
- Gazing link/token:
- Devices and browsers:

## 1. Create a home watch as Account A

- [ ] Sign in as Account A on a mobile device.
- [ ] Open the selected film page.
- [ ] Open the watch-planning action.
- [ ] Choose a home watch rather than a theatrical watch.
- [ ] Invite Account B directly.
- [ ] Set a future start time.
- [ ] Add the distinctive test location note.
- [ ] Create the watch.
- [ ] Confirm the resulting page shows the correct film, time, timezone, and invited person.
- [ ] Confirm a home watch does **not** show a theater-ticket CTA.

Observed result:

## 2. Verify private-location access

### Signed out

- [ ] Copy the gazing link and open it while signed out.
- [ ] Confirm only safe public event information is visible.
- [ ] Confirm the private location note is **not** visible.

### Unrelated signed-in account

- [ ] If Account C is available, open the link while signed in as Account C.
- [ ] Confirm the private location note is **not** visible.

### Invited account

- [ ] Sign in as Account B and open the invitation.
- [ ] Confirm the private location note **is** visible to Account B.
- [ ] Confirm the displayed start time and timezone are correct.

Observed result:

## 3. RSVP and calendar state as Account B

- [ ] RSVP as Account B.
- [ ] Confirm the page visibly reflects the RSVP.
- [ ] Add the watch to the device calendar.
- [ ] Open the calendar entry and confirm its film, date, time, and timezone.

Observed result:

## 4. Verify host state as Account A

- [ ] Return to the watch as Account A.
- [ ] Confirm Account B appears in the attending roster.
- [ ] Check the mobile layout for clipped controls, overlapping text, sideways scrolling, or
      controls that require repeated taps.

Observed result:

## 5. Verify reminders and duplicate protection

This step requires access to invoke the maintenance/reminder job at a controlled time. Use a
watch whose start time falls inside either the 24-hour or 2-hour reminder window.

Before the first invocation, predict the result:

- Expected new Account B notifications:
- Expected reminder kind (`24h` or `2h`):

Then:

- [ ] Invoke the reminder job once.
- [ ] Confirm Account B receives exactly one in-app notification.
- [ ] If push is enabled, confirm the push opens the correct gazing page.
- [ ] Invoke the same reminder job again without changing the watch.
- [ ] Confirm no duplicate notification is created or delivered.

Observed first invocation:

Observed second invocation:

## 6. Close the watch and confirm attendance

- [ ] Once the watch is ready to close, sign in as Account A.
- [ ] Mark the watch as **Happened**.
- [ ] Confirm the event shows its closed/happened state.
- [ ] Confirm attendance as Account A.
- [ ] Sign in as Account B and independently confirm attendance.
- [ ] Confirm neither account can confirm attendance for the other person.

Observed result:

## 7. Complete the aftermath

- [ ] Confirm the aftermath shows the expected participant roster.
- [ ] Record a verdict through the existing watched flow.
- [ ] Confirm the verdict remains visible after reloading.
- [ ] As Account A, try **Summon again**.
- [ ] As Account B, try **Plan another**.
- [ ] Confirm each action opens a valid follow-on flow rather than a dead control.

Observed result:

## 8. Verify continuation behavior

- [ ] Complete an action that produces a continuation prompt.
- [ ] Confirm the prompt contains no more than two choices.
- [ ] Close the prompt immediately and confirm the original action still feels complete.
- [ ] Continue browsing in the same browser session.
- [ ] Confirm the closed prompt does not reappear during that session.

Observed result:

## 9. Regression-check theatrical gazing

- [ ] Open or create a real theatrical gazing event.
- [ ] Confirm theater and ticket information still appears.
- [ ] Confirm its RSVP behavior still works.
- [ ] Confirm the theatrical page does not accidentally use home-watch location treatment.

Observed result:

## 10. Capture instrumentation evidence

Before running the report, write down the expected event-count changes caused by this walkthrough.
Then run:

```bash
cd db
set -a
source .env
set +a
npx tsx scripts/return-rituals-report.ts
```

- [ ] Compare predicted and observed counts.
- [ ] Record discrepancies rather than repeating actions until the numbers look right.

Predicted changes:

Observed report:

## Final result

- [ ] PASS — every required check behaved as expected.
- [ ] PASS WITH NOTES — no privacy or data-integrity failure, but minor visual issues were found.
- [ ] FAIL — a privacy, authorization, duplicate-notification, or broken-flow issue was found.

Screenshots or screen recordings:

Issues found:

Follow-up owner/date:

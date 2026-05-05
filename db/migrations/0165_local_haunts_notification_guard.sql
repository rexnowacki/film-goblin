-- 0165: Prevent duplicate Local Haunts notifications for the same user/showing.

CREATE UNIQUE INDEX notifications_theater_showing_once
  ON notifications (user_id, kind, ((payload->>'showing_id')))
  WHERE kind = 'theater_showing_match';

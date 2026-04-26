-- 0126_notification_triggers.sql
-- Four SECURITY DEFINER triggers fan source-table events into notifications.

-- (a) coven_requests INSERT → coven_invite_pending for to_user
CREATE OR REPLACE FUNCTION public.notify_coven_invite_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    NEW.to_user_id,
    'coven_invite_pending',
    NEW.from_user_id,
    jsonb_build_object('coven_request_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_insert_notify
AFTER INSERT ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_pending();

-- (b) coven_requests pending → accepted → coven_invite_accepted for from_user
CREATE OR REPLACE FUNCTION public.notify_coven_invite_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, kind, actor_user_id, payload)
    VALUES (
      NEW.from_user_id,
      'coven_invite_accepted',
      NEW.to_user_id,
      jsonb_build_object('coven_request_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_accept_notify
AFTER UPDATE ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_accepted();

-- (c) recommendations INSERT → recommendation_received for to_user
CREATE OR REPLACE FUNCTION public.notify_recommendation_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    NEW.to_user_id,
    'recommendation_received',
    NEW.from_user_id,
    jsonb_build_object('recommendation_id', NEW.id, 'film_id', NEW.film_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_recommendation_insert_notify
AFTER INSERT ON recommendations
FOR EACH ROW EXECUTE FUNCTION public.notify_recommendation_received();

-- (d) price_alerts INSERT → price_drop for the watchlist owner
CREATE OR REPLACE FUNCTION public.notify_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    wl.user_id,
    'price_drop',
    NULL,
    jsonb_build_object(
      'price_alert_id', NEW.id,
      'film_id', NEW.film_id,
      'old_price_usd', NEW.old_price_usd,
      'new_price_usd', NEW.new_price_usd
    )
  FROM watchlists wl
  WHERE wl.id = NEW.watchlist_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_price_alert_insert_notify
AFTER INSERT ON price_alerts
FOR EACH ROW EXECUTE FUNCTION public.notify_price_drop();

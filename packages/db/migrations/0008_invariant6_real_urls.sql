-- Reserved .invalid hosts (RFC 2606) are placeholders and never count as a supporting source.
CREATE OR REPLACE FUNCTION assert_published_has_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev record;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    SELECT id, publish_state, is_synthetic INTO ev FROM events WHERE id = NEW.id;
  ELSE
    SELECT id, publish_state, is_synthetic INTO ev FROM events WHERE id = OLD.event_id;
  END IF;
  IF ev.id IS NOT NULL AND ev.publish_state = 'published' AND NOT ev.is_synthetic THEN
    IF NOT EXISTS (SELECT 1 FROM source_records sr WHERE sr.event_id = ev.id AND sr.url ~ '^https?://' AND sr.url !~* '^https?://[^/?#]*\.invalid([/:?#]|$)' AND sr.record_status <> 'rejected') THEN
      RAISE EXCEPTION 'Invariant 6 violated: published event % has no supporting source record with URL', ev.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- Database-level overlap checks serialize concurrent assignments in D1.
CREATE TRIGGER legs_conflict_insert BEFORE INSERT ON legs
WHEN NEW.driver_id IS NOT NULL OR NEW.vehicle_id IS NOT NULL
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM legs l JOIN bookings b ON b.id=l.booking_id
  WHERE b.status NOT IN ('cancelled','completed') AND l.operational_status NOT IN ('completed','no_show')
  AND l.pickup_at < NEW.end_at AND l.end_at > NEW.pickup_at
  AND ((NEW.driver_id IS NOT NULL AND l.driver_id=NEW.driver_id) OR (NEW.vehicle_id IS NOT NULL AND l.vehicle_id=NEW.vehicle_id))
 ) THEN RAISE(ABORT,'ASSIGNMENT_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER legs_conflict_update BEFORE UPDATE OF driver_id,vehicle_id,pickup_at,end_at ON legs
WHEN NEW.driver_id IS NOT NULL OR NEW.vehicle_id IS NOT NULL
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM legs l JOIN bookings b ON b.id=l.booking_id
  WHERE l.id<>NEW.id AND b.status NOT IN ('cancelled','completed') AND l.operational_status NOT IN ('completed','no_show')
  AND l.pickup_at < NEW.end_at AND l.end_at > NEW.pickup_at
  AND ((NEW.driver_id IS NOT NULL AND l.driver_id=NEW.driver_id) OR (NEW.vehicle_id IS NOT NULL AND l.vehicle_id=NEW.vehicle_id))
 ) THEN RAISE(ABORT,'ASSIGNMENT_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER legs_window_insert BEFORE INSERT ON legs
BEGIN
 SELECT CASE WHEN NEW.end_at<=NEW.pickup_at THEN RAISE(ABORT,'INVALID_TIME_WINDOW') END;
END;
--> statement-breakpoint
CREATE TRIGGER legs_window_update BEFORE UPDATE OF pickup_at,end_at ON legs
BEGIN
 SELECT CASE WHEN NEW.end_at<=NEW.pickup_at THEN RAISE(ABORT,'INVALID_TIME_WINDOW') END;
END;

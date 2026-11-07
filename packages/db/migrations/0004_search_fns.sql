-- Must stay in parity with packages/core/src/eligibility.ts (tested in packages/db/test/search.test.ts).
CREATE FUNCTION ff_age_match(rule age_rule_type, rmin int, rmax int, by_min int, by_max int, cutoff date, qmin int, qmax int, event_start date)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE lo numeric; hi numeric; rlo numeric; rhi numeric; y int; bylo int; byhi int;
BEGIN
  IF qmin IS NULL OR qmax IS NULL THEN RETURN 'definite'; END IF;
  IF rule = 'unknown' OR rule = 'grade' THEN RETURN 'possible'; END IF;
  IF rule = 'birth_year' THEN
    IF by_min IS NULL AND by_max IS NULL THEN RETURN 'possible'; END IF;
    IF event_start IS NULL THEN RETURN 'possible'; END IF;
    y := extract(year FROM event_start)::int;
    bylo := y - qmax - 1; byhi := y - qmin;
    IF bylo >= coalesce(by_min, -100000) AND byhi <= coalesce(by_max, 100000) THEN RETURN 'definite'; END IF;
    IF byhi < coalesce(by_min, -100000) OR bylo > coalesce(by_max, 100000) THEN RETURN 'no'; END IF;
    RETURN 'possible';
  END IF;
  rlo := CASE WHEN rmin IS NOT NULL THEN rmin WHEN rule = 'age_under' THEN -1000 ELSE NULL END;
  rhi := rmax;
  IF rlo IS NULL OR rhi IS NULL THEN RETURN 'possible'; END IF;
  lo := qmin; hi := qmax;
  IF cutoff IS NOT NULL THEN
    IF event_start IS NULL THEN RETURN 'possible'; END IF;
    IF cutoff <= event_start THEN lo := qmin - 1; ELSE hi := qmax + 1; END IF;
  END IF;
  IF lo >= rlo AND hi <= rhi THEN RETURN 'definite'; END IF;
  IF hi < rlo OR lo > rhi THEN RETURN 'no'; END IF;
  RETURN 'possible';
END $$;

CREATE FUNCTION ff_verification_rank(v verification_level) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(enum_range(NULL::verification_level), v)
$$;

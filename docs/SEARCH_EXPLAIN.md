# Main search query — EXPLAIN ANALYZE

Recorded 2026-11-07T04:48:44.466Z on the local dev database (40 events, 126 divisions, 40 venues — synthetic demo data).
Query: `/?region=plano&gender=girls&ageMin=10&ageMax=12&chips=next30` → 3 results. Wall time for explain + query + venue/division fetch: 71.6 ms.

At this size Postgres reasonably prefers sequential scans; the GiST indexes on `events.during`, `league_sessions.during`,
`venues.location` and the division filter index exist for larger datasets. Re-run this script after loading real
data at scale and revisit indexes before adding any search infrastructure.

```
Limit (actual time=7.950..8.125 rows=3 loops=1)
  Buffers: shared hit=404
  ->  Result (actual time=7.949..8.123 rows=3 loops=1)
        Buffers: shared hit=404
        ->  Sort (actual time=7.560..7.568 rows=3 loops=1)
              Sort Key: (COALESCE((SubPlan 10), e.start_date)), e.name
              Sort Method: quicksort  Memory: 28kB
              Buffers: shared hit=272
              ->  WindowAgg (actual time=7.525..7.541 rows=3 loops=1)
                    Buffers: shared hit=266
                    ->  Nested Loop Semi Join (actual time=7.415..7.507 rows=3 loops=1)
                          Join Filter: (ff_age_match(d.age_rule_type, d.age_min, d.age_max, d.birth_year_min, d.birth_year_max, d.age_cutoff_date, 10, 12, e.start_date) <> 'no'::text)
                          Rows Removed by Join Filter: 3
                          Buffers: shared hit=262
                          ->  Nested Loop Left Join (actual time=6.997..7.483 rows=6 loops=1)
                                Buffers: shared hit=250
                                ->  Nested Loop Left Join (actual time=6.962..7.033 rows=6 loops=1)
                                      Buffers: shared hit=168
                                      ->  Nested Loop (actual time=6.955..7.020 rows=6 loops=1)
                                            Buffers: shared hit=156
                                            ->  HashAggregate (actual time=6.939..6.946 rows=20 loops=1)
                                                  Group Key: ev.event_id
                                                  Batches: 1  Memory Usage: 24kB
                                                  Buffers: shared hit=114
                                                  ->  Nested Loop (actual time=6.802..6.930 rows=20 loops=1)
                                                        Buffers: shared hit=114
                                                        ->  Bitmap Heap Scan on venues v (actual time=6.779..6.837 rows=20 loops=1)
                                                              Recheck Cond: (st_dwithin(location, '0101000020E610000029CB10C7BA2C58C0FB3A70CE88824040'::geography, '25000'::double precision, true) OR (location IS NULL))
                                                              Filter: (st_dwithin(location, '0101000020E610000029CB10C7BA2C58C0FB3A70CE88824040'::geography, '25000'::double precision, true) OR ((location IS NULL) AND (hashed SubPlan 13)))
                                                              Rows Removed by Filter: 10
                                                              Heap Blocks: exact=1
                                                              Buffers: shared hit=74
                                                              ->  BitmapOr (actual time=0.013..0.014 rows=0 loops=1)
                                                                    Buffers: shared hit=2
                                                                    ->  Bitmap Index Scan on venues_location_gist (actual time=0.012..0.012 rows=26 loops=1)
                                                                          Index Cond: (location && _st_expand('0101000020E610000029CB10C7BA2C58C0FB3A70CE88824040'::geography, '25000'::double precision))
                                                                          Buffers: shared hit=1
                                                                    ->  Bitmap Index Scan on venues_location_gist (actual time=0.001..0.001 rows=4 loops=1)
                                                                          Index Cond: (location IS NULL)
                                                                          Buffers: shared hit=1
                                                              SubPlan 13
                                                                ->  Seq Scan on regions (actual time=0.020..0.021 rows=1 loops=1)
                                                                      Filter: ((id = '8b8829ce-d2d2-43ba-8430-07b0aa33744e'::uuid) OR (parent_id = '8b8829ce-d2d2-43ba-8430-07b0aa33744e'::uuid))
                                                                      Rows Removed by Filter: 22
                                                                      Buffers: shared hit=1
                                                        ->  Bitmap Heap Scan on event_venues ev (actual time=0.002..0.004 rows=1 loops=20)
                                                              Recheck Cond: (venue_id = v.id)
                                                              Heap Blocks: exact=20
                                                              Buffers: shared hit=40
                                                              ->  Bitmap Index Scan on event_venues_venue (actual time=0.001..0.001 rows=1 loops=20)
                                                                    Index Cond: (venue_id = v.id)
                                                                    Buffers: shared hit=20
                                            ->  Memoize (actual time=0.003..0.003 rows=0 loops=20)
                                                  Cache Key: ev.event_id
                                                  Cache Mode: logical
                                                  Hits: 0  Misses: 20  Evictions: 0  Overflows: 0  Memory Usage: 6kB
                                                  Buffers: shared hit=42
                                                  ->  Index Scan using events_pkey on events e (actual time=0.003..0.003 rows=0 loops=20)
                                                        Index Cond: (id = ev.event_id)
                                                        Filter: ((status <> 'completed'::event_status) AND (publish_state = 'published'::publish_state) AND ((during && '[2026-11-06,2026-12-07)'::daterange) OR (hashed SubPlan 12)))
                                                        Rows Removed by Filter: 1
                                                        Buffers: shared hit=42
                                                        SubPlan 12
                                                          ->  Bitmap Heap Scan on league_sessions ls_3 (actual time=0.006..0.007 rows=3 loops=1)
                                                                Recheck Cond: (during && '[2026-11-06,2026-12-07)'::daterange)
                                                                Heap Blocks: exact=1
                                                                Buffers: shared hit=2
                                                                ->  Bitmap Index Scan on league_sessions_during_gist (actual time=0.004..0.005 rows=3 loops=1)
                                                                      Index Cond: (during && '[2026-11-06,2026-12-07)'::daterange)
                                                                      Buffers: shared hit=1
                                      ->  Index Scan using organizers_pkey on organizers o (actual time=0.001..0.001 rows=1 loops=6)
                                            Index Cond: (id = e.organizer_id)
                                            Buffers: shared hit=12
                                ->  Limit (actual time=0.074..0.074 rows=0 loops=6)
                                      Buffers: shared hit=82
                                      ->  Sort (actual time=0.073..0.073 rows=0 loops=6)
                                            Sort Key: d_1.fee_currency, (CASE d_1.pricing_basis WHEN 'per_player'::pricing_basis THEN 0 WHEN 'per_family'::pricing_basis THEN 1 WHEN 'per_team'::pricing_basis THEN 2 ELSE 3 END), d_1.fee_amount_minor
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=82
                                            ->  Bitmap Heap Scan on divisions d_1 (actual time=0.067..0.068 rows=0 loops=6)
                                                  Recheck Cond: (event_id = e.id)
                                                  Filter: ((gender_category = ANY ('{girls}'::gender_category[])) AND (age_rule_type <> 'unknown'::age_rule_type) AND (fee_status = 'known'::known_status) AND (ff_age_match(age_rule_type, age_min, age_max, birth_year_min, birth_year_max, age_cutoff_date, 10, 12, e.start_date) <> 'no'::text))
                                                  Rows Removed by Filter: 3
                                                  Heap Blocks: exact=6
                                                  Buffers: shared hit=73
                                                  ->  Bitmap Index Scan on divisions_event (actual time=0.001..0.001 rows=3 loops=6)
                                                        Index Cond: (event_id = e.id)
                                                        Buffers: shared hit=6
                          ->  Index Scan using divisions_event on divisions d (actual time=0.001..0.002 rows=1 loops=6)
                                Index Cond: (event_id = ev.event_id)
                                Filter: ((gender_category = ANY ('{girls}'::gender_category[])) AND (age_rule_type <> 'unknown'::age_rule_type))
                                Rows Removed by Filter: 2
                                Buffers: shared hit=12
                    SubPlan 10
                      ->  Aggregate (actual time=0.004..0.005 rows=1 loops=3)
                            Buffers: shared hit=4
                            ->  Bitmap Heap Scan on league_sessions ls_2 (actual time=0.002..0.003 rows=0 loops=3)
                                  Recheck Cond: (event_id = e.id)
                                  Filter: (end_date >= '2026-11-06'::date)
                                  Heap Blocks: exact=1
                                  Buffers: shared hit=4
                                  ->  Bitmap Index Scan on league_sessions_event (actual time=0.002..0.002 rows=0 loops=3)
                                        Index Cond: (event_id = e.id)
                                        Buffers: shared hit=3
        SubPlan 1
          ->  Aggregate (actual time=0.020..0.020 rows=1 loops=3)
                Buffers: shared hit=9
                ->  Hash Join (actual time=0.011..0.014 rows=1 loops=3)
                      Hash Cond: (v_1.id = ev_1.venue_id)
                      Buffers: shared hit=9
                      ->  Seq Scan on venues v_1 (actual time=0.001..0.004 rows=36 loops=3)
                            Filter: (location IS NOT NULL)
                            Rows Removed by Filter: 4
                            Buffers: shared hit=3
                      ->  Hash (actual time=0.004..0.004 rows=1 loops=3)
                            Buckets: 1024  Batches: 1  Memory Usage: 9kB
                            Buffers: shared hit=6
                            ->  Bitmap Heap Scan on event_venues ev_1 (actual time=0.002..0.002 rows=1 loops=3)
                                  Recheck Cond: (event_id = e.id)
                                  Heap Blocks: exact=3
                                  Buffers: shared hit=6
                                  ->  Bitmap Index Scan on event_venues_pkey (actual time=0.001..0.001 rows=1 loops=3)
                                        Index Cond: (event_id = e.id)
                                        Buffers: shared hit=3
        SubPlan 2
          ->  Aggregate (actual time=0.002..0.002 rows=1 loops=3)
                Buffers: shared hit=4
                ->  Bitmap Heap Scan on league_sessions ls (actual time=0.001..0.001 rows=0 loops=3)
                      Recheck Cond: (event_id = e.id)
                      Filter: (end_date >= '2026-11-06'::date)
                      Heap Blocks: exact=1
                      Buffers: shared hit=4
                      ->  Bitmap Index Scan on league_sessions_event (actual time=0.000..0.001 rows=0 loops=3)
                            Index Cond: (event_id = e.id)
                            Buffers: shared hit=3
        SubPlan 3
          ->  Aggregate (actual time=0.018..0.018 rows=1 loops=3)
                Buffers: shared hit=6
                ->  Bitmap Heap Scan on divisions d_2 (actual time=0.008..0.014 rows=1 loops=3)
                      Recheck Cond: (event_id = e.id)
                      Filter: ((gender_category = ANY ('{girls}'::gender_category[])) AND (age_rule_type <> 'unknown'::age_rule_type) AND (ff_age_match(age_rule_type, age_min, age_max, birth_year_min, birth_year_max, age_cutoff_date, 10, 12, e.start_date) <> 'no'::text))
                      Rows Removed by Filter: 2
                      Heap Blocks: exact=3
                      Buffers: shared hit=6
                      ->  Bitmap Index Scan on divisions_event (actual time=0.001..0.001 rows=3 loops=3)
                            Index Cond: (event_id = e.id)
                            Buffers: shared hit=3
        SubPlan 4
          ->  Seq Scan on divisions d_3 (actual time=0.019..0.019 rows=1 loops=3)
                Filter: ((event_id = e.id) AND (fee_status = 'known'::known_status))
                Rows Removed by Filter: 44
                Buffers: shared hit=5
        SubPlan 6
          ->  Aggregate (actual time=0.012..0.012 rows=1 loops=3)
                Buffers: shared hit=6
                ->  Bitmap Heap Scan on divisions d_4 (actual time=0.006..0.007 rows=1 loops=3)
                      Recheck Cond: (event_id = e.id)
                      Filter: ((gender_category = ANY ('{girls}'::gender_category[])) AND (age_rule_type <> 'unknown'::age_rule_type) AND (ff_age_match(age_rule_type, age_min, age_max, birth_year_min, birth_year_max, age_cutoff_date, 10, 12, e.start_date) <> 'no'::text))
                      Rows Removed by Filter: 2
                      Heap Blocks: exact=3
                      Buffers: shared hit=6
                      ->  Bitmap Index Scan on divisions_event (actual time=0.001..0.001 rows=3 loops=3)
                            Index Cond: (event_id = e.id)
                            Buffers: shared hit=3
        SubPlan 7
          ->  Aggregate (actual time=0.017..0.017 rows=1 loops=3)
                Buffers: shared hit=9
                ->  Hash Join (actual time=0.010..0.014 rows=1 loops=3)
                      Hash Cond: (v_2.id = ev_2.venue_id)
                      Buffers: shared hit=9
                      ->  Seq Scan on venues v_2 (actual time=0.001..0.004 rows=36 loops=3)
                            Filter: (location IS NOT NULL)
                            Rows Removed by Filter: 4
                            Buffers: shared hit=3
                      ->  Hash (actual time=0.004..0.004 rows=1 loops=3)
                            Buckets: 1024  Batches: 1  Memory Usage: 9kB
                            Buffers: shared hit=6
                            ->  Bitmap Heap Scan on event_venues ev_2 (actual time=0.001..0.001 rows=1 loops=3)
                                  Recheck Cond: (event_id = e.id)
                                  Heap Blocks: exact=3
                                  Buffers: shared hit=6
                                  ->  Bitmap Index Scan on event_venues_pkey (actual time=0.001..0.001 rows=1 loops=3)
                                        Index Cond: (event_id = e.id)
                                        Buffers: shared hit=3
        SubPlan 8
          ->  Aggregate (actual time=0.018..0.019 rows=1 loops=3)
                Buffers: shared hit=9
                ->  Hash Join (actual time=0.012..0.016 rows=1 loops=3)
                      Hash Cond: (v_3.id = ev_3.venue_id)
                      Buffers: shared hit=9
                      ->  Seq Scan on venues v_3 (actual time=0.001..0.003 rows=36 loops=3)
                            Filter: (location IS NOT NULL)
                            Rows Removed by Filter: 4
                            Buffers: shared hit=3
                      ->  Hash (actual time=0.005..0.005 rows=1 loops=3)
                            Buckets: 1024  Batches: 1  Memory Usage: 9kB
                            Buffers: shared hit=6
                            ->  Bitmap Heap Scan on event_venues ev_3 (actual time=0.002..0.002 rows=1 loops=3)
                                  Recheck Cond: (event_id = e.id)
                                  Heap Blocks: exact=3
                                  Buffers: shared hit=6
                                  ->  Bitmap Index Scan on event_venues_pkey (actual time=0.001..0.001 rows=1 loops=3)
                                        Index Cond: (event_id = e.id)
                                        Buffers: shared hit=3
        SubPlan 9
          ->  Aggregate (actual time=0.002..0.002 rows=1 loops=3)
                Buffers: shared hit=4
                ->  Bitmap Heap Scan on league_sessions ls_1 (actual time=0.001..0.001 rows=0 loops=3)
                      Recheck Cond: (event_id = e.id)
                      Filter: (end_date >= '2026-11-06'::date)
                      Heap Blocks: exact=1
                      Buffers: shared hit=4
                      ->  Bitmap Index Scan on league_sessions_event (actual time=0.000..0.000 rows=0 loops=3)
                            Index Cond: (event_id = e.id)
                            Buffers: shared hit=3
Planning:
  Buffers: shared hit=897
Planning Time: 3.570 ms
Execution Time: 9.315 ms
```

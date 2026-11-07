-- Regions are data, not code. Centers are approximate city centers used only as search
-- anchors (never displayed as venue locations).
INSERT INTO regions (slug, name, kind, country_code, admin_area, timezone, center, radius_km, priority_bucket, is_priority, sort_order) VALUES
 ('us',  'United States', 'country', 'US', NULL, 'America/Chicago', ST_GeogFromText('POINT(-98.58 39.83)'), 2500, 'us', false, 900),
 ('tx',  'Texas',         'state',   'US', 'TX', 'America/Chicago', ST_GeogFromText('POINT(-99.90 31.97)'), 700, 'us', false, 800),
 ('dfw', 'Dallas–Fort Worth', 'metro', 'US', 'TX', 'America/Chicago', ST_GeogFromText('POINT(-96.95 32.85)'), 80, 'dfw', true, 0);

INSERT INTO regions (slug, name, kind, parent_id, country_code, admin_area, timezone, center, radius_km, priority_bucket, is_priority, sort_order)
SELECT v.slug, v.name, 'city', (SELECT id FROM regions WHERE slug='dfw'), 'US', 'TX', 'America/Chicago',
       ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography, 25, 'dfw', true, v.ord
FROM (VALUES
 ('dallas','Dallas',32.7767,-96.7970,1), ('fort-worth','Fort Worth',32.7555,-97.3308,2),
 ('arlington','Arlington',32.7357,-97.1081,3), ('plano','Plano',33.0198,-96.6989,4),
 ('frisco','Frisco',33.1507,-96.8236,5), ('allen','Allen',33.1032,-96.6706,6),
 ('mckinney','McKinney',33.1972,-96.6398,7), ('prosper','Prosper',33.2362,-96.8011,8),
 ('richardson','Richardson',32.9483,-96.7299,9), ('garland','Garland',32.9126,-96.6389,10),
 ('irving','Irving',32.8140,-96.9489,11), ('grand-prairie','Grand Prairie',32.7460,-96.9978,12),
 ('carrollton','Carrollton',32.9756,-96.8900,13), ('lewisville','Lewisville',33.0462,-96.9942,14),
 ('flower-mound','Flower Mound',33.0146,-97.0970,15), ('coppell','Coppell',32.9546,-97.0150,16),
 ('grapevine','Grapevine',32.9343,-97.0781,17), ('southlake','Southlake',32.9412,-97.1342,18),
 ('keller','Keller',32.9346,-97.2292,19), ('denton','Denton',33.2148,-97.1331,20)
) AS v(slug,name,lat,lon,ord);

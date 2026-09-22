insert into public.buildings (id, name, tone, sort_order) values
  ('catalyst', 'Catalyst', 'blue', 1),
  ('tapestry', 'Tapestry', 'gold', 2),
  ('mosaic', 'Mosaic', 'peach', 3),
  ('kaleidoscope', 'Kaleidoscope', 'green', 4)
on conflict (id) do update set
  name = excluded.name,
  tone = excluded.tone,
  sort_order = excluded.sort_order;

insert into public.floor_groups (
  id, building_id, label, floor_labels, suite_prefix,
  start_date, end_date, start_hour, end_hour, sort_order
) values
  ('cat-10-11', 'catalyst', '10 / 11', array['10', '11'], '10', '2026-09-28', '2026-10-09', 10, 20, 1),
  ('cat-09', 'catalyst', '09', array['09'], '09', '2026-09-28', '2026-10-09', 11, 19, 2),
  ('tap-04a', 'tapestry', '04-A', array['04-A'], '04', '2026-09-28', '2026-10-09', 10, 20, 1),
  ('tap-04b', 'tapestry', '04-B', array['04-B'], '04', '2026-09-28', '2026-10-09', 10, 20, 2),
  ('mos-06-07', 'mosaic', '06 / 07', array['06', '07'], '06', '2026-09-28', '2026-10-09', 12, 20, 1),
  ('kal-08', 'kaleidoscope', '08', array['08'], '08', '2026-09-28', '2026-10-09', 9, 18, 1)
on conflict (id) do nothing;

insert into public.suites (id, floor_group_id, floor_label, number) values
  ('1010', 'cat-10-11', '10', '1010'),
  ('1006', 'cat-10-11', '10', '1006'),
  ('1007', 'cat-10-11', '10', '1007'),
  ('1110', 'cat-10-11', '11', '1110'),
  ('1112', 'cat-10-11', '11', '1112'),
  ('0911', 'cat-09', '09', '0911'),
  ('0411-a', 'tap-04a', '04-A', '0411'),
  ('0412-a', 'tap-04a', '04-A', '0412'),
  ('0413-b', 'tap-04b', '04-B', '0413'),
  ('0610', 'mos-06-07', '06', '0610'),
  ('0710', 'mos-06-07', '07', '0710'),
  ('0814', 'kal-08', '08', '0814')
on conflict (id) do nothing;

update public.suites set connected_suite_id = '1110' where id = '1010';
update public.suites set connected_suite_id = '1010' where id = '1110';
update public.suites set connected_suite_id = '0710' where id = '0610';
update public.suites set connected_suite_id = '0610' where id = '0710';

insert into public.calendar_slots (
  floor_group_id, floor_label, slot_date, hour, state
) values
  ('cat-10-11', '10', '2026-09-28', 10, 'unavailable'),
  ('cat-10-11', '10', '2026-09-28', 11, 'unavailable'),
  ('cat-10-11', '10', '2026-10-02', 17, 'unavailable'),
  ('cat-10-11', '11', '2026-09-30', 14, 'unavailable'),
  ('cat-10-11', '11', '2026-10-03', 10, 'unavailable'),
  ('cat-10-11', '11', '2026-10-03', 11, 'unavailable'),
  ('tap-04a', '04-A', '2026-09-30', 14, 'unavailable')
on conflict do nothing;

insert into public.calendar_slots (
  floor_group_id, floor_label, slot_date, hour, state
)
select floor_group_id, floor_label, slot_date, hour + 0.5, state
from public.calendar_slots
where state = 'unavailable' and hour = trunc(hour)
on conflict do nothing;

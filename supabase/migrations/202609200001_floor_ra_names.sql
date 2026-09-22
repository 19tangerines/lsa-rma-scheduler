begin;

alter table public.floor_groups
  add column ra_names text[] not null default '{}'::text[];

-- Two RAs may manage different suite sets on the same physical floor. Their
-- floor groups remain distinct by id even when their visible labels match.
alter table public.floor_groups
  drop constraint if exists floor_groups_building_id_label_key;

commit;

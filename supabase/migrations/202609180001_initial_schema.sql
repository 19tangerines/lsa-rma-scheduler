create table public.buildings (
  id text primary key,
  name text not null unique,
  tone text not null check (tone in ('blue', 'gold', 'peach', 'green')),
  sort_order smallint not null default 0
);

create table public.floor_groups (
  id text primary key default gen_random_uuid()::text,
  building_id text not null references public.buildings(id) on delete cascade,
  label text not null,
  floor_labels text[] not null check (cardinality(floor_labels) > 0),
  suite_prefix text not null,
  start_date date not null,
  end_date date not null,
  start_hour numeric(4,1) not null check (start_hour between 0 and 23.5 and start_hour * 2 = trunc(start_hour * 2)),
  end_hour numeric(4,1) not null check (end_hour between 0.5 and 24 and end_hour * 2 = trunc(end_hour * 2)),
  sort_order smallint not null default 0,
  constraint floor_groups_valid_dates check (start_date <= end_date),
  constraint floor_groups_valid_hours check (start_hour < end_hour),
  unique (building_id, label)
);

create table public.suites (
  id text primary key default gen_random_uuid()::text,
  floor_group_id text not null references public.floor_groups(id) on delete cascade,
  floor_label text not null,
  number text not null,
  connected_suite_id text unique references public.suites(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint suites_not_connected_to_self check (connected_suite_id is null or connected_suite_id <> id),
  unique (floor_group_id, floor_label, number)
);

create table public.bookings (
  id text primary key default gen_random_uuid()::text,
  floor_group_id text not null references public.floor_groups(id) on delete cascade,
  booking_date date not null,
  start_hour numeric(4,1) not null check (start_hour between 0 and 23.5 and start_hour * 2 = trunc(start_hour * 2)),
  duration smallint not null check (duration in (2, 3)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_suites (
  booking_id text not null references public.bookings(id) on delete cascade,
  suite_id text not null unique references public.suites(id) on delete cascade,
  primary key (booking_id, suite_id)
);

create table public.calendar_slots (
  floor_group_id text not null references public.floor_groups(id) on delete cascade,
  floor_label text not null,
  slot_date date not null,
  hour numeric(4,1) not null check (hour between 0 and 23.5 and hour * 2 = trunc(hour * 2)),
  state text not null check (state in ('booked', 'unavailable')),
  booking_id text references public.bookings(id) on delete cascade,
  primary key (floor_group_id, floor_label, slot_date, hour),
  constraint calendar_slots_booking_shape check (
    (state = 'booked' and booking_id is not null)
    or (state = 'unavailable' and booking_id is null)
  )
);

create index bookings_floor_date_idx
  on public.bookings (floor_group_id, booking_date, start_hour);

create index calendar_slots_booking_idx
  on public.calendar_slots (booking_id)
  where booking_id is not null;

create or replace function public.create_booking(
  p_suite_id text,
  p_date date,
  p_start_hour numeric
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suite public.suites;
  v_connected public.suites;
  v_floor public.floor_groups;
  v_booking public.bookings;
  v_duration smallint;
begin
  if p_start_hour * 2 <> trunc(p_start_hour * 2) then
    raise exception using message = 'Choose a time on the hour or half hour.';
  end if;

  select * into v_suite
  from public.suites
  where id = p_suite_id;

  if not found then
    raise exception using message = 'That suite could not be found.';
  end if;

  if v_suite.connected_suite_id is not null then
    select * into v_connected
    from public.suites
    where id = v_suite.connected_suite_id;

    if not found
      or v_connected.connected_suite_id is distinct from v_suite.id
      or v_connected.floor_group_id <> v_suite.floor_group_id then
      raise exception using message = 'This suite connection is invalid. Please contact an administrator.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(least(v_suite.id, v_connected.id), 0));
    perform pg_advisory_xact_lock(hashtextextended(greatest(v_suite.id, v_connected.id), 0));
    v_duration := 3;
  else
    perform pg_advisory_xact_lock(hashtextextended(v_suite.id, 0));
    v_duration := 2;
  end if;

  select * into v_floor
  from public.floor_groups
  where id = v_suite.floor_group_id;

  if p_date < v_floor.start_date
    or p_date > v_floor.end_date
    or p_start_hour < v_floor.start_hour
    or p_start_hour + v_duration > v_floor.end_hour then
    raise exception using message = 'That time is outside this floor''s schedule.';
  end if;

  insert into public.bookings (floor_group_id, booking_date, start_hour, duration)
  values (v_suite.floor_group_id, p_date, p_start_hour, v_duration)
  returning * into v_booking;

  insert into public.booking_suites (booking_id, suite_id)
  values (v_booking.id, v_suite.id);

  if v_connected.id is not null then
    insert into public.booking_suites (booking_id, suite_id)
    values (v_booking.id, v_connected.id);
  end if;

  insert into public.calendar_slots (
    floor_group_id,
    floor_label,
    slot_date,
    hour,
    state,
    booking_id
  )
  select
    v_suite.floor_group_id,
    requested_floor.floor_label,
    p_date,
    p_start_hour + slot_offset / 2.0,
    'booked',
    v_booking.id
  from (
    select v_suite.floor_label
    union
    select v_connected.floor_label where v_connected.id is not null
  ) as requested_floor
  cross join generate_series(0, v_duration * 2 - 1) as slot_offset;

  return v_booking;
exception
  when unique_violation then
    raise exception using message = 'That suite already has a booking, or that time is no longer available.';
end;
$$;

create or replace function public.connect_suites(
  p_suite_id text,
  p_connected_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suite public.suites;
  v_connected public.suites;
begin
  select * into v_suite
  from public.suites
  where id = p_suite_id
  for update;

  select * into v_connected
  from public.suites
  where floor_group_id = v_suite.floor_group_id
    and number = p_connected_number
  for update;

  if v_suite.id is null or v_connected.id is null then
    raise exception using message = 'Enter a suite number from this floor group.';
  end if;
  if v_suite.id = v_connected.id then
    raise exception using message = 'A suite cannot connect to itself.';
  end if;
  if v_suite.connected_suite_id is not null or v_connected.connected_suite_id is not null then
    raise exception using message = 'One of these suites already has a connection.';
  end if;
  if exists (
    select 1 from public.booking_suites
    where suite_id in (v_suite.id, v_connected.id)
  ) then
    raise exception using message = 'Suites with existing bookings cannot be connected.';
  end if;

  update public.suites set connected_suite_id = v_connected.id where id = v_suite.id;
  update public.suites set connected_suite_id = v_suite.id where id = v_connected.id;
end;
$$;

create or replace function public.disconnect_suite(p_suite_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suite public.suites;
begin
  select * into v_suite
  from public.suites
  where id = p_suite_id
  for update;

  if v_suite.id is null or v_suite.connected_suite_id is null then
    return;
  end if;
  if exists (
    select 1 from public.booking_suites
    where suite_id in (v_suite.id, v_suite.connected_suite_id)
  ) then
    raise exception using message = 'Suites with existing bookings cannot be disconnected.';
  end if;

  update public.suites
  set connected_suite_id = null
  where id in (v_suite.id, v_suite.connected_suite_id);
end;
$$;

create or replace function public.update_booking_time(
  p_booking_id text,
  p_date date,
  p_start_hour numeric
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_floor public.floor_groups;
begin
  if p_start_hour * 2 <> trunc(p_start_hour * 2) then
    raise exception using message = 'Choose a time on the hour or half hour.';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception using message = 'That booking could not be found.';
  end if;

  select * into v_floor
  from public.floor_groups
  where id = v_booking.floor_group_id;

  if p_date < v_floor.start_date
    or p_date > v_floor.end_date
    or p_start_hour < v_floor.start_hour
    or p_start_hour + v_booking.duration > v_floor.end_hour then
    raise exception using message = 'That time is outside this floor''s schedule.';
  end if;

  delete from public.calendar_slots
  where booking_id = v_booking.id;

  update public.bookings
  set booking_date = p_date,
      start_hour = p_start_hour,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  insert into public.calendar_slots (
    floor_group_id,
    floor_label,
    slot_date,
    hour,
    state,
    booking_id
  )
  select
    v_booking.floor_group_id,
    suite.floor_label,
    p_date,
    p_start_hour + slot_offset / 2.0,
    'booked',
    v_booking.id
  from (
    select distinct s.floor_label
    from public.booking_suites bs
    join public.suites s on s.id = bs.suite_id
    where bs.booking_id = v_booking.id
  ) as suite
  cross join generate_series(0, v_booking.duration * 2 - 1) as slot_offset;

  return v_booking;
exception
  when unique_violation then
    raise exception using message = 'That time is no longer available. Please choose another time.';
end;
$$;

alter table public.buildings enable row level security;
alter table public.floor_groups enable row level security;
alter table public.suites enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_suites enable row level security;
alter table public.calendar_slots enable row level security;

revoke all on table public.buildings from anon, authenticated;
revoke all on table public.floor_groups from anon, authenticated;
revoke all on table public.suites from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.booking_suites from anon, authenticated;
revoke all on table public.calendar_slots from anon, authenticated;
revoke execute on function public.create_booking(text, date, numeric) from public, anon, authenticated;
revoke execute on function public.update_booking_time(text, date, numeric) from public, anon, authenticated;
revoke execute on function public.connect_suites(text, text) from public, anon, authenticated;
revoke execute on function public.disconnect_suite(text) from public, anon, authenticated;
grant execute on function public.create_booking(text, date, numeric) to service_role;
grant execute on function public.update_booking_time(text, date, numeric) to service_role;
grant execute on function public.connect_suites(text, text) to service_role;
grant execute on function public.disconnect_suite(text) to service_role;

begin;

drop function if exists public.create_booking(text, date, smallint);
drop function if exists public.update_booking_time(text, date, smallint);

alter table public.floor_groups drop constraint floor_groups_start_hour_check;
alter table public.floor_groups drop constraint floor_groups_end_hour_check;
alter table public.floor_groups drop constraint floor_groups_valid_hours;
alter table public.bookings drop constraint bookings_start_hour_check;
alter table public.calendar_slots drop constraint calendar_slots_pkey;
alter table public.calendar_slots drop constraint calendar_slots_hour_check;

alter table public.floor_groups
  alter column start_hour type numeric(4,1) using start_hour::numeric,
  alter column end_hour type numeric(4,1) using end_hour::numeric;
alter table public.bookings
  alter column start_hour type numeric(4,1) using start_hour::numeric;
alter table public.calendar_slots
  alter column hour type numeric(4,1) using hour::numeric;

alter table public.floor_groups
  add constraint floor_groups_start_hour_check
    check (start_hour between 0 and 23.5 and start_hour * 2 = trunc(start_hour * 2)),
  add constraint floor_groups_end_hour_check
    check (end_hour between 0.5 and 24 and end_hour * 2 = trunc(end_hour * 2)),
  add constraint floor_groups_valid_hours check (start_hour < end_hour);
alter table public.bookings
  add constraint bookings_start_hour_check
    check (start_hour between 0 and 23.5 and start_hour * 2 = trunc(start_hour * 2));
alter table public.calendar_slots
  add constraint calendar_slots_hour_check
    check (hour between 0 and 23.5 and hour * 2 = trunc(hour * 2)),
  add primary key (floor_group_id, floor_label, slot_date, hour);

-- Every old row represented a whole hour. Add its matching second half-hour so
-- existing availability and bookings retain exactly the same real-world span.
insert into public.calendar_slots (
  floor_group_id,
  floor_label,
  slot_date,
  hour,
  state,
  booking_id
)
select
  floor_group_id,
  floor_label,
  slot_date,
  hour + 0.5,
  state,
  booking_id
from public.calendar_slots
where hour = trunc(hour)
on conflict do nothing;

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

revoke execute on function public.create_booking(text, date, numeric) from public, anon, authenticated;
revoke execute on function public.update_booking_time(text, date, numeric) from public, anon, authenticated;
grant execute on function public.create_booking(text, date, numeric) to service_role;
grant execute on function public.update_booking_time(text, date, numeric) to service_role;

commit;

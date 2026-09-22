begin;

alter table public.floor_groups
  add column if not exists single_suite_duration numeric(3,1) not null default 2,
  add column if not exists connected_suite_duration numeric(3,1) not null default 3;

alter table public.floor_groups
  alter column single_suite_duration set default 2,
  alter column single_suite_duration set not null,
  alter column connected_suite_duration set default 3,
  alter column connected_suite_duration set not null,
  drop constraint if exists floor_groups_single_suite_duration_check,
  drop constraint if exists floor_groups_connected_suite_duration_check;

alter table public.floor_groups
  add constraint floor_groups_single_suite_duration_check check (
    single_suite_duration between 0.5 and 6
    and single_suite_duration * 2 = trunc(single_suite_duration * 2)
  ),
  add constraint floor_groups_connected_suite_duration_check check (
    connected_suite_duration between 0.5 and 6
    and connected_suite_duration * 2 = trunc(connected_suite_duration * 2)
  );

alter table public.bookings
  drop constraint if exists bookings_duration_check,
  alter column duration type numeric(3,1) using duration::numeric,
  add constraint bookings_duration_check check (
    duration between 0.5 and 6
    and duration * 2 = trunc(duration * 2)
  );

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
  v_duration numeric(3,1);
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
  else
    perform pg_advisory_xact_lock(hashtextextended(v_suite.id, 0));
  end if;

  select * into v_floor
  from public.floor_groups
  where id = v_suite.floor_group_id;

  -- Choose the configured duration after loading the floor settings.
  if v_connected.id is not null then
    v_duration := v_floor.connected_suite_duration;
  else
    v_duration := v_floor.single_suite_duration;
  end if;

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
  cross join generate_series(0, (v_duration * 2)::integer - 1) as slot_offset;

  return v_booking;
exception
  when unique_violation then
    raise exception using message = 'That suite already has a booking, or that time is no longer available.';
end;
$$;

revoke execute on function public.create_booking(text, date, numeric) from public, anon, authenticated;
grant execute on function public.create_booking(text, date, numeric) to service_role;

commit;

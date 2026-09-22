import type { Booking } from "./scheduler-types";
import { getSupabaseAdmin } from "./supabase-server";

type BookingRow = {
  id: string;
  floor_group_id: string;
  booking_date: string;
  start_hour: number;
  duration: number;
  booking_suites: { suite_id: string }[];
};

export async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .select("id,floor_group_id,booking_date,start_hour,duration,booking_suites(suite_id)")
    .eq("id", id)
    .single();

  if (error) throw error;
  const row = data as BookingRow;
  return {
    id: row.id,
    suiteIds: row.booking_suites.map((link) => link.suite_id),
    floorGroupId: row.floor_group_id,
    date: row.booking_date,
    startHour: row.start_hour,
    duration: row.duration,
  };
}

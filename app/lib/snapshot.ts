import type { Booking, Building, FloorGroup, SchedulerSnapshot, Suite } from "./scheduler-types";
import { getSupabaseAdmin } from "./supabase-server";

type BuildingRow = { id: string; name: string; tone: Building["tone"] };
type FloorRow = {
  id: string;
  building_id: string;
  label: string;
  floor_labels: string[];
  ra_names: string[];
  suite_prefix: string;
  start_date: string;
  end_date: string;
  start_hour: number;
  end_hour: number;
  single_suite_duration: number;
  connected_suite_duration: number;
};
type SuiteRow = {
  id: string;
  floor_group_id: string;
  floor_label: string;
  number: string;
  connected_suite_id: string | null;
};
type BookingRow = {
  id: string;
  floor_group_id: string;
  booking_date: string;
  start_hour: number;
  duration: number;
  booking_suites: { suite_id: string }[];
};
type SlotRow = { floor_group_id: string; floor_label: string; slot_date: string; hour: number };

const SLOT_PAGE_SIZE = 1_000;

async function getUnavailableSlots(): Promise<SlotRow[]> {
  const supabase = getSupabaseAdmin();
  const slots: SlotRow[] = [];

  for (let from = 0; ; from += SLOT_PAGE_SIZE) {
    const { data, error } = await supabase.from("calendar_slots")
      .select("floor_group_id,floor_label,slot_date,hour")
      .eq("state", "unavailable")
      .order("floor_group_id")
      .order("floor_label")
      .order("slot_date")
      .order("hour")
      .range(from, from + SLOT_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data as SlotRow[];
    slots.push(...page);
    if (page.length < SLOT_PAGE_SIZE) return slots;
  }
}

export async function getSnapshot(): Promise<SchedulerSnapshot> {
  const supabase = getSupabaseAdmin();
  const [buildingsResult, floorsResult, suitesResult, bookingsResult, slots] = await Promise.all([
    supabase.from("buildings").select("id,name,tone").order("sort_order"),
    supabase.from("floor_groups").select("id,building_id,label,floor_labels,ra_names,suite_prefix,start_date,end_date,start_hour,end_hour,single_suite_duration,connected_suite_duration").order("sort_order"),
    supabase.from("suites").select("id,floor_group_id,floor_label,number,connected_suite_id").order("number"),
    supabase.from("bookings").select("id,floor_group_id,booking_date,start_hour,duration,booking_suites(suite_id)").order("booking_date").order("start_hour"),
    getUnavailableSlots(),
  ]);

  const error = buildingsResult.error ?? floorsResult.error ?? suitesResult.error ?? bookingsResult.error;
  if (error) throw error;

  const buildings = (buildingsResult.data as BuildingRow[]).map((row): Building => ({
    id: row.id,
    name: row.name,
    tone: row.tone,
  }));
  const floorGroups = (floorsResult.data as FloorRow[]).map((row): FloorGroup => ({
    id: row.id,
    buildingId: row.building_id,
    label: row.label,
    floorLabels: row.floor_labels,
    raNames: row.floor_labels.map((_, index) => row.ra_names?.[index] ?? ""),
    suitePrefix: row.suite_prefix,
    startDate: row.start_date,
    endDate: row.end_date,
    startHour: row.start_hour,
    endHour: row.end_hour,
    singleSuiteDuration: row.single_suite_duration,
    connectedSuiteDuration: row.connected_suite_duration,
  }));
  const suites = (suitesResult.data as SuiteRow[]).map((row): Suite => ({
    id: row.id,
    floorGroupId: row.floor_group_id,
    floorLabel: row.floor_label,
    number: row.number,
    ...(row.connected_suite_id ? { connectedSuiteId: row.connected_suite_id } : {}),
  }));
  const bookings = (bookingsResult.data as BookingRow[]).map((row): Booking => ({
    id: row.id,
    suiteIds: row.booking_suites.map((link) => link.suite_id),
    floorGroupId: row.floor_group_id,
    date: row.booking_date,
    startHour: row.start_hour,
    duration: row.duration,
  }));
  const unavailable = slots.map(
    (row) => `${row.floor_group_id}|${row.floor_label}|${row.slot_date}|${row.hour}`,
  );

  return { buildings, floorGroups, suites, bookings, unavailable };
}

import { apiError, readHalfHour, readInteger, readString } from "@/app/lib/api-response";
import { requireAdmin } from "@/app/lib/admin-auth";
import type { FloorGroup, Suite } from "@/app/lib/scheduler-types";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

type ActionBody = Record<string, unknown> & { action?: unknown };

type FloorDraft = ReturnType<typeof readFloorDraft>;

function buildUnavailableSlots(floorGroupId: string, draft: FloorDraft) {
  const slots = [];
  const start = new Date(`${draft.startDate}T00:00:00Z`);
  const end = new Date(`${draft.endDate}T00:00:00Z`);

  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const slotDate = date.toISOString().slice(0, 10);
    for (const floorLabel of draft.floorLabels) {
      for (let hour = draft.startHour; hour < draft.endHour; hour += 0.5) {
        slots.push({
          floor_group_id: floorGroupId,
          floor_label: floorLabel,
          slot_date: slotDate,
          hour,
          state: "unavailable",
        });
      }
    }
  }

  return slots;
}

function readFloorDraft(body: ActionBody) {
  const buildingId = readString(body.buildingId);
  const label = readString(body.label);
  const assignments = Array.isArray(body.floorLabels)
    ? body.floorLabels.map((label, index) => ({
        label: readString(label),
        raName: Array.isArray(body.raNames) ? readString(body.raNames[index]).slice(0, 80) : "",
      })).filter((assignment) => assignment.label)
    : [];
  const floorLabels = assignments.map((assignment) => assignment.label);
  const raNames = assignments.map((assignment) => assignment.raName);
  const suitePrefix = readString(body.suitePrefix);
  const startDate = readString(body.startDate);
  const endDate = readString(body.endDate);
  const startHour = readInteger(body.startHour);
  const endHour = readInteger(body.endHour);
  const singleSuiteDuration = readHalfHour(body.singleSuiteDuration);
  const connectedSuiteDuration = readHalfHour(body.connectedSuiteDuration);
  if (
    !label || !floorLabels.length || new Set(floorLabels).size !== floorLabels.length
    || !suitePrefix || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate
    || startHour === null || endHour === null || startHour < 0 || endHour > 24
    || startHour >= endHour
    || singleSuiteDuration === null || connectedSuiteDuration === null
    || singleSuiteDuration < 0.5 || connectedSuiteDuration < 0.5
    || singleSuiteDuration > 6 || connectedSuiteDuration > 6
  ) {
    throw new Error("Enter valid floor names, dates, and hours.");
  }
  return { buildingId, label, floorLabels, raNames, suitePrefix, startDate, endDate, startHour, endHour, singleSuiteDuration, connectedSuiteDuration };
}

function mapSuite(row: {
  id: string;
  floor_group_id: string;
  floor_label: string;
  number: string;
  connected_suite_id: string | null;
}): Suite {
  return {
    id: row.id,
    floorGroupId: row.floor_group_id,
    floorLabel: row.floor_label,
    number: row.number,
    ...(row.connected_suite_id ? { connectedSuiteId: row.connected_suite_id } : {}),
  };
}

function mapFloor(row: {
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
}): FloorGroup {
  return {
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
  };
}

async function handleAction(body: ActionBody) {
  const supabase = getSupabaseAdmin();
  const action = readString(body.action);

  if (action === "setAvailability") {
    const floorGroupId = readString(body.floorGroupId);
    const floorLabel = readString(body.floorLabel);
    const date = readString(body.date);
    const hour = readHalfHour(body.hour);
    const makeUnavailable = body.makeUnavailable === true;
    if (!floorGroupId || !floorLabel || !/^\d{4}-\d{2}-\d{2}$/.test(date) || hour === null) {
      throw new Error("Choose a valid availability slot.");
    }

    if (makeUnavailable) {
      const { error } = await supabase.from("calendar_slots").insert({
        floor_group_id: floorGroupId,
        floor_label: floorLabel,
        slot_date: date,
        hour,
        state: "unavailable",
      });
      if (error?.code === "23505") {
        const { data: existing, error: lookupError } = await supabase.from("calendar_slots")
          .select("state")
          .eq("floor_group_id", floorGroupId)
          .eq("floor_label", floorLabel)
          .eq("slot_date", date)
          .eq("hour", hour)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.state !== "unavailable") {
          throw new Error("This hour belongs to an existing booking and cannot be made unavailable.");
        }
      } else if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("calendar_slots").delete()
        .eq("floor_group_id", floorGroupId)
        .eq("floor_label", floorLabel)
        .eq("slot_date", date)
        .eq("hour", hour)
        .eq("state", "unavailable");
      if (error) throw error;
    }
    return { ok: true };
  }

  if (action === "addSuite") {
    const floorGroupId = readString(body.floorGroupId);
    const floorLabel = readString(body.floorLabel);
    const number = readString(body.number);
    if (!floorGroupId || !floorLabel || !/^\d{1,8}$/.test(number)) throw new Error("Enter a valid suite number.");
    const { data: floor, error: floorError } = await supabase.from("floor_groups").select("floor_labels").eq("id", floorGroupId).single();
    if (floorError || !floor?.floor_labels.includes(floorLabel)) throw new Error("That floor could not be found.");
    const { data, error } = await supabase.from("suites").insert({
      floor_group_id: floorGroupId,
      floor_label: floorLabel,
      number,
    }).select("id,floor_group_id,floor_label,number,connected_suite_id").single();
    if (error) throw error;
    return mapSuite(data);
  }

  if (action === "connectSuites") {
    const suiteId = readString(body.suiteId);
    const connectedNumber = readString(body.connectedNumber);
    const { error } = await supabase.rpc("connect_suites", {
      p_suite_id: suiteId,
      p_connected_number: connectedNumber,
    });
    if (error) throw error;
    return { ok: true };
  }

  if (action === "disconnectSuite") {
    const { error } = await supabase.rpc("disconnect_suite", { p_suite_id: readString(body.suiteId) });
    if (error) throw error;
    return { ok: true };
  }

  if (action === "deleteSuite") {
    const suiteId = readString(body.suiteId);
    const { count, error: bookingError } = await supabase.from("booking_suites")
      .select("booking_id", { count: "exact", head: true }).eq("suite_id", suiteId);
    if (bookingError) throw bookingError;
    if (count) throw new Error("This suite has an existing booking and cannot be deleted.");
    const { error } = await supabase.from("suites").delete().eq("id", suiteId);
    if (error) throw error;
    return { ok: true };
  }

  if (action === "addFloorGroup") {
    const draft = readFloorDraft(body);
    if (!draft.buildingId) throw new Error("Choose a building.");
    const { data, error } = await supabase.from("floor_groups").insert({
      building_id: draft.buildingId,
      label: draft.label,
      floor_labels: draft.floorLabels,
      ra_names: draft.raNames,
      suite_prefix: draft.suitePrefix,
      start_date: draft.startDate,
      end_date: draft.endDate,
      start_hour: draft.startHour,
      end_hour: draft.endHour,
      single_suite_duration: draft.singleSuiteDuration,
      connected_suite_duration: draft.connectedSuiteDuration,
    }).select("id,building_id,label,floor_labels,ra_names,suite_prefix,start_date,end_date,start_hour,end_hour,single_suite_duration,connected_suite_duration").single();
    if (error) throw error;

    const slots = buildUnavailableSlots(data.id, draft);
    for (let index = 0; index < slots.length; index += 500) {
      const { error: slotError } = await supabase.from("calendar_slots").insert(slots.slice(index, index + 500));
      if (slotError) {
        await supabase.from("floor_groups").delete().eq("id", data.id);
        throw new Error(`The floor could not be initialized as unavailable: ${slotError.message}`);
      }
    }

    return mapFloor(data);
  }

  if (action === "updateFloorGroup") {
    const floorGroupId = readString(body.floorGroupId);
    const draft = readFloorDraft(body);
    const { data: current, error: currentError } = await supabase.from("floor_groups")
      .select("id,building_id,floor_labels,start_date,end_date,start_hour,end_hour").eq("id", floorGroupId).single();
    if (currentError) throw new Error("That floor could not be found.");

    const { data: bookings, error: bookingError } = await supabase.from("bookings")
      .select("id,booking_date,start_hour,duration").eq("floor_group_id", floorGroupId);
    if (bookingError) throw bookingError;
    if (bookings.some((booking) => booking.booking_date < draft.startDate || booking.booking_date > draft.endDate || booking.start_hour < draft.startHour || booking.start_hour + booking.duration > draft.endHour)) {
      throw new Error("Those settings would invalidate an existing booking. Update or delete the booking first.");
    }

    const removedLabels = current.floor_labels.filter((label: string) => !draft.floorLabels.includes(label));
    if (removedLabels.length) {
      const { count, error } = await supabase.from("suites")
        .select("id", { count: "exact", head: true })
        .eq("floor_group_id", floorGroupId)
        .in("floor_label", removedLabels);
      if (error) throw error;
      if (count) throw new Error("Remove the suites from that floor before removing it from this group.");
    }

    for (let index = 0; index < Math.min(current.floor_labels.length, draft.floorLabels.length); index += 1) {
      const previous = current.floor_labels[index];
      const next = draft.floorLabels[index];
      if (previous === next) continue;
      const { error: suiteError } = await supabase.from("suites").update({ floor_label: next })
        .eq("floor_group_id", floorGroupId).eq("floor_label", previous);
      if (suiteError) throw suiteError;
      const { error: slotError } = await supabase.from("calendar_slots").update({ floor_label: next })
        .eq("floor_group_id", floorGroupId).eq("floor_label", previous);
      if (slotError) throw slotError;
    }

    // The editor appends newly added floors after the existing labels. Seed the
    // whole schedule as unavailable so an RA must explicitly open each slot.
    const addedLabels = draft.floorLabels.slice(current.floor_labels.length);
    if (addedLabels.length) {
      const slots = buildUnavailableSlots(floorGroupId, { ...draft, floorLabels: addedLabels });
      for (let index = 0; index < slots.length; index += 500) {
        const { error: slotError } = await supabase.from("calendar_slots").insert(slots.slice(index, index + 500));
        if (slotError) {
          await supabase.from("calendar_slots").delete()
            .eq("floor_group_id", floorGroupId)
            .in("floor_label", addedLabels)
            .eq("state", "unavailable");
          throw new Error(`The new floor could not be initialized as unavailable: ${slotError.message}`);
        }
      }
    }

    // Any dates or hours newly brought into an existing floor's schedule must
    // start unavailable. This also resets cells that are removed and later
    // reintroduced instead of treating their missing rows as available.
    const retainedLabels = draft.floorLabels.slice(0, Math.min(current.floor_labels.length, draft.floorLabels.length));
    const expandedSlots = buildUnavailableSlots(floorGroupId, { ...draft, floorLabels: retainedLabels }).filter((slot) => (
      slot.slot_date < current.start_date
      || slot.slot_date > current.end_date
      || slot.hour < current.start_hour
      || slot.hour >= current.end_hour
    ));
    for (let index = 0; index < expandedSlots.length; index += 500) {
      const { error: slotError } = await supabase.from("calendar_slots").upsert(
        expandedSlots.slice(index, index + 500),
        { onConflict: "floor_group_id,floor_label,slot_date,hour", ignoreDuplicates: true },
      );
      if (slotError) throw new Error(`The added calendar dates or hours could not be initialized as unavailable: ${slotError.message}`);
    }

    const { data, error } = await supabase.from("floor_groups").update({
      label: draft.label,
      floor_labels: draft.floorLabels,
      ra_names: draft.raNames,
      suite_prefix: draft.suitePrefix,
      start_date: draft.startDate,
      end_date: draft.endDate,
      start_hour: draft.startHour,
      end_hour: draft.endHour,
      single_suite_duration: draft.singleSuiteDuration,
      connected_suite_duration: draft.connectedSuiteDuration,
    }).eq("id", floorGroupId)
      .select("id,building_id,label,floor_labels,ra_names,suite_prefix,start_date,end_date,start_hour,end_hour,single_suite_duration,connected_suite_duration").single();
    if (error) {
      if (addedLabels.length) {
        await supabase.from("calendar_slots").delete()
          .eq("floor_group_id", floorGroupId)
          .in("floor_label", addedLabels)
          .eq("state", "unavailable");
      }
      throw error;
    }
    return mapFloor(data);
  }

  if (action === "deleteFloorGroup") {
    const { error } = await supabase.from("floor_groups").delete().eq("id", readString(body.floorGroupId));
    if (error) throw error;
    return { ok: true };
  }

  throw new Error("Unknown admin action.");
}

export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as ActionBody;
    return Response.json(await handleAction(body));
  } catch (error) {
    return apiError(error, 409);
  }
}

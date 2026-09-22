import { apiError, readHalfHour, readString } from "@/app/lib/api-response";
import { getBooking } from "@/app/lib/booking-record";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      suiteId?: unknown;
      date?: unknown;
      startHour?: unknown;
    };
    const suiteId = readString(body.suiteId);
    const date = readString(body.date);
    const startHour = readHalfHour(body.startHour);
    if (!suiteId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || startHour === null) {
      return Response.json({ error: "Choose a valid suite, date, and time." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin().rpc("create_booking", {
      p_suite_id: suiteId,
      p_date: date,
      p_start_hour: startHour,
    });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.id) throw new Error("The booking was not created.");

    return Response.json(await getBooking(created.id), { status: 201 });
  } catch (error) {
    return apiError(error, 409);
  }
}

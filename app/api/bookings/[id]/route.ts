import { apiError, readHalfHour, readString } from "@/app/lib/api-response";
import { getBooking } from "@/app/lib/booking-record";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { date?: unknown; startHour?: unknown };
    const date = readString(body.date);
    const startHour = readHalfHour(body.startHour);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || startHour === null) {
      return Response.json({ error: "Choose a valid date and time." }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin().rpc("update_booking_time", {
      p_booking_id: id,
      p_date: date,
      p_start_hour: startHour,
    });
    if (error) throw error;

    return Response.json(await getBooking(id));
  } catch (error) {
    return apiError(error, 409);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) return Response.json({ error: "Booking ID is required." }, { status: 400 });

    const { error } = await getSupabaseAdmin().from("bookings").delete().eq("id", id);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

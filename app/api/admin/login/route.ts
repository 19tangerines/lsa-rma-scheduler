import { apiError, readString } from "@/app/lib/api-response";
import { createAdminCookie, verifyAdminPin } from "@/app/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: unknown };
    const pin = readString(body.pin);
    if (!/^\d{4,8}$/.test(pin) || !(await verifyAdminPin(pin))) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Response.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": await createAdminCookie(request) } },
    );
  } catch (error) {
    return apiError(error);
  }
}

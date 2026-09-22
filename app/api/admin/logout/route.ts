import { clearAdminCookie } from "@/app/lib/admin-auth";

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearAdminCookie(request) } },
  );
}

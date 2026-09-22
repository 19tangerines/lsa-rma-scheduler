import { hasAdminSession } from "@/app/lib/admin-auth";

export async function GET(request: Request) {
  return Response.json({ authenticated: await hasAdminSession(request) });
}

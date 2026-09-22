import { apiError } from "@/app/lib/api-response";
import { getSnapshot } from "@/app/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

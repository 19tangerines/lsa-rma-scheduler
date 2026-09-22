import type { Booking, FloorGroup, SchedulerSnapshot, Suite } from "./scheduler-types";

export type { Booking, Building, FloorGroup, SchedulerSnapshot, Suite } from "./scheduler-types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

const adminAction = <T,>(action: string, input: Record<string, unknown> = {}) => request<T>(
  "/api/admin/actions",
  { method: "POST", body: JSON.stringify({ action, ...input }) },
);

export const schedulerApi = {
  getSnapshot: () => request<SchedulerSnapshot>("/api/snapshot", { cache: "no-store" }),

  async verifyAdminPin(pin: string) {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
      credentials: "same-origin",
    });
    if (response.status === 401) return false;
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || "Admin login is unavailable.");
    }
    return true;
  },

  logoutAdmin: () => request<{ ok: true }>("/api/admin/logout", { method: "POST" }),

  async createBooking(input: Omit<Booking, "id">) {
    return request<Booking>("/api/bookings", {
      method: "POST",
      body: JSON.stringify({ suiteId: input.suiteIds[0], date: input.date, startHour: input.startHour }),
    });
  },

  async updateBooking(id: string, date: string, startHour: number) {
    return request<Booking>(`/api/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ date, startHour }),
    });
  },

  async deleteBooking(id: string) {
    await request<void>(`/api/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async toggleAvailability(floorGroupId: string, floorLabel: string, date: string, hour: number) {
    const snapshot = await schedulerApi.getSnapshot();
    const key = `${floorGroupId}|${floorLabel}|${date}|${hour}`;
    await schedulerApi.setAvailability(floorGroupId, floorLabel, date, hour, !snapshot.unavailable.includes(key));
    const refreshed = await schedulerApi.getSnapshot();
    return refreshed.unavailable;
  },

  async setAvailability(floorGroupId: string, floorLabel: string, date: string, hour: number, makeUnavailable: boolean) {
    await adminAction("setAvailability", { floorGroupId, floorLabel, date, hour, makeUnavailable });
  },

  addSuite(input: Omit<Suite, "id">) {
    return adminAction<Suite>("addSuite", input);
  },

  async connectSuites(suiteId: string, connectedNumber: string) {
    await adminAction("connectSuites", { suiteId, connectedNumber });
  },

  async disconnectSuite(suiteId: string) {
    await adminAction("disconnectSuite", { suiteId });
  },

  async deleteSuite(suiteId: string) {
    await adminAction("deleteSuite", { suiteId });
  },

  addFloorGroup(input: Omit<FloorGroup, "id">) {
    return adminAction<FloorGroup>("addFloorGroup", input);
  },

  updateFloorGroup(id: string, input: Omit<FloorGroup, "id" | "buildingId">) {
    return adminAction<FloorGroup>("updateFloorGroup", { floorGroupId: id, ...input });
  },

  async deleteFloorGroup(id: string) {
    await adminAction("deleteFloorGroup", { floorGroupId: id });
  },
};

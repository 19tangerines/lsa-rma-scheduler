import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the scheduler shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sixth College LSA \/ RMA Scheduler<\/title>/i);
  assert.match(html, /Book a conflict-free LSA or RMA appointment for your suite\./);
  assert.match(html, /favicon-cat\.png/);
  assert.match(html, /class="app-page loading">LSA\/RMA Scheduler/);
});

test("keeps the MVP interaction contracts in place", async () => {
  const [page, css, api] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scheduler-api.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const buildCalendarDates/);
  assert.match(page, /buildCalendarDates\(floor\.startDate, floor\.endDate\)/);
  assert.doesNotMatch(page, /const dates = \[/);
  assert.match(page, />exit admin mode<\/button>/);
  assert.match(page, /blue = available · click or drag across boxes to change availability/);
  assert.match(page, /no suites yet/);
  assert.match(page, /bookingSaving \? "saving…" : "confirm"/);
  assert.match(page, /RA name \(optional\)/);
  assert.match(page, /single-suite appointment:/);
  assert.match(page, /connected-suite appointment:/);
  assert.match(page, /Changes apply to new bookings only\./);
  assert.match(page, /searchParams\.set\("floor", floorId\)/);
  assert.match(css, /\.calendar-scroll[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /date-head:nth-of-type/);
  assert.match(api, /\/api\/bookings/);
  assert.match(api, /\/api\/admin\/login/);
});

test("new floors default to unavailable on create and when appended", async () => {
  const adminActions = await readFile(new URL("../app/api/admin/actions/route.ts", import.meta.url), "utf8");

  assert.match(adminActions, /buildUnavailableSlots\(data\.id, draft\)/);
  assert.match(adminActions, /draft\.floorLabels\.slice\(current\.floor_labels\.length\)/);
  assert.match(adminActions, /buildUnavailableSlots\(floorGroupId, \{ \.\.\.draft, floorLabels: addedLabels \}\)/);
});

test("loads every availability page and tolerates duplicate unavailable writes", async () => {
  const [snapshot, adminActions] = await Promise.all([
    readFile(new URL("../app/lib/snapshot.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/actions/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(snapshot, /const SLOT_PAGE_SIZE = 1_000/);
  assert.match(snapshot, /\.range\(from, from \+ SLOT_PAGE_SIZE - 1\)/);
  assert.match(snapshot, /if \(page\.length < SLOT_PAGE_SIZE\) return slots/);
  assert.match(adminActions, /if \(error\?\.code === "23505"\)/);
  assert.match(adminActions, /if \(existing\?\.state !== "unavailable"\)/);
});

test("newly added calendar dates and hours default to unavailable", async () => {
  const adminActions = await readFile(new URL("../app/api/admin/actions/route.ts", import.meta.url), "utf8");

  assert.match(adminActions, /slot\.slot_date < current\.start_date/);
  assert.match(adminActions, /slot\.slot_date > current\.end_date/);
  assert.match(adminActions, /slot\.hour < current\.start_hour/);
  assert.match(adminActions, /slot\.hour >= current\.end_hour/);
  assert.match(adminActions, /ignoreDuplicates: true/);
  assert.match(adminActions, /added calendar dates or hours could not be initialized as unavailable/i);
});

test("keeps active calendars synchronized without synchronized request bursts", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /AUTO_SYNC_MIN_DELAY = 20_000/);
  assert.match(page, /Math\.random\(\) \* AUTO_SYNC_JITTER/);
  assert.match(page, /refreshInFlight/);
  assert.match(page, /window\.addEventListener\("focus", syncWhenVisible\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", syncWhenVisible\)/);
  assert.match(page, /document\.visibilityState === "visible"/);
});

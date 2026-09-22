"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Booking, type Building, type FloorGroup, type SchedulerSnapshot, type Suite, schedulerApi } from "./lib/scheduler-api";

type Screen = "home" | "buildings" | "floors" | "calendar" | "suites" | "booking" | "confirm" | "receipt" | "admin-pin" | "admin-buildings" | "admin-floors" | "admin-calendar" | "admin-suites" | "admin-create-floor" | "admin-edit-floor";

type CalendarDate = { iso: string; short: string; day: string; long: string; weekday: string; inRange: boolean };
type SuiteDraft = Suite & { isNew?: boolean };

const DEFAULT_START_DATE = "2026-09-28";
const DEFAULT_END_DATE = "2026-10-09";
const AUTO_SYNC_SCREENS = new Set<Screen>(["calendar", "suites", "booking", "confirm", "receipt", "admin-calendar"]);
const AUTO_SYNC_MIN_DELAY = 20_000;
const AUTO_SYNC_JITTER = 10_000;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayShort = ["su", "m", "tu", "w", "th", "f", "sa"];
const ordinal = (day: number) => {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
};
const describeDate = (iso: string, inRange = true): CalendarDate => {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return { iso, short: `${month}/${day}`, day: weekdayShort[date.getUTCDay()], long: `${monthNames[month - 1]} ${day}${ordinal(day)}, ${year}`, weekday: weekdayNames[date.getUTCDay()], inRange };
};
const buildCalendarDates = (startDate: string, endDate: string) => {
  const result: CalendarDate[] = [];
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const rangeStart = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(end.getTime()) || rangeStart > end) return result;
  const current = new Date(rangeStart);
  current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
  const displayEnd = new Date(end);
  displayEnd.setUTCDate(displayEnd.getUTCDate() + ((7 - displayEnd.getUTCDay()) % 7));
  while (current <= displayEnd) {
    const iso = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
    result.push(describeDate(iso, current >= rangeStart && current <= end));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
};
const hourLabel = (hour: number) => {
  const totalMinutes = Math.round(hour * 60);
  const normalizedHour = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${normalizedHour >= 12 ? "pm" : "am"}`;
};
const rangeLabel = (start: number, duration: number) => `${hourLabel(start)} - ${hourLabel(start + duration)}`;
const durationLabel = (duration: number) => `${duration} hour${duration === 1 ? "" : "s"}`;
const raNameFor = (floor: FloorGroup, floorLabel: string) => floor.raNames[floor.floorLabels.indexOf(floorLabel)]?.trim() ?? "";
const raSummaryFor = (floor: FloorGroup) => {
  return floor.floorLabels
    .map((label) => raNameFor(floor, label))
    .filter(Boolean)
    .join(" · ");
};
const updateSharedFloorUrl = (floorId: string | null, method: "push" | "replace" = "push") => {
  const url = new URL(window.location.href);
  if (floorId) url.searchParams.set("floor", floorId);
  else url.searchParams.delete("floor");
  if (method === "replace") window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
};

function AdminSettings({ onEditSuites, onEditFloor }: { onEditSuites: () => void; onEditFloor: () => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeMenu = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="admin-settings" ref={menu}>
    <button className="settings-trigger" type="button" aria-label="Open floor settings menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((visible) => !visible)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .9l-.03.08V21h-4v-.62A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.9-1l-.08-.03H3v-4h.62A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.9l.03-.08V3h4v.62A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .9 1l.08.03H21v4h-.62a1.7 1.7 0 0 0-.98 1Z" /></svg>
    </button>
    {open && <div className="settings-menu" role="menu">
      <button className="settings-menu-item" type="button" role="menuitem" onClick={onEditSuites}>edit suites</button>
      <button className="settings-menu-item" type="button" role="menuitem" onClick={onEditFloor}>floor settings</button>
    </div>}
  </div>;
}

function Header({ admin = false, onExit, onBack }: { admin?: boolean; onExit?: () => void; onBack?: () => void }) {
  return <header className="page-header"><div className="page-header-primary">{onBack && <Back onClick={onBack} />}<span>LSA/RMA Scheduler</span></div>{admin && <div className="page-header-actions"><button className="admin-exit" onClick={onExit}>exit admin mode</button></div>}</header>;
}

function ChevronIcon({ direction = "left" }: { direction?: "left" | "right" }) {
  return <svg className={`chevron-icon ${direction}`} viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5 5.5 5 5.5" /></svg>;
}

function PlusIcon() {
  return <svg className="simple-action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>;
}

function CloseIcon() {
  return <svg className="simple-action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9" /></svg>;
}

function Back({ onClick }: { onClick: () => void }) {
  return <button className="back-button" onClick={onClick} aria-label="Go back"><ChevronIcon /></button>;
}

function BuildingButtons({ buildings, onSelect }: { buildings: Building[]; onSelect: (building: Building) => void }) {
  return <div className="building-buttons">{buildings.map((building) => <button className={`building-choice ${building.tone}`} key={building.id} onClick={() => onSelect(building)}>{building.name.toLowerCase()}</button>)}</div>;
}

function FloorSwitch({ floor, active, onChange }: { floor: FloorGroup; active: string; onChange: (floorLabel: string) => void }) {
  if (floor.floorLabels.length === 1) {
    const raName = raNameFor(floor, floor.floorLabels[0]);
    return <div className="floor-heading"><h2>{floor.floorLabels[0]}</h2>{raName && <small>{raName}</small>}</div>;
  }
  return <div className="floor-switch" aria-label="Choose a floor">{floor.floorLabels.map((label, index) => {
    const raName = raNameFor(floor, label);
    return <span key={label}><button className={active === label ? "active" : ""} onClick={() => onChange(label)}><b>{label}</b>{raName && <small>{raName}</small>}</button>{index < floor.floorLabels.length - 1 && <i>|</i>}</span>;
  })}</div>;
}

type FloorDraft = Omit<FloorGroup, "id" | "buildingId">;

function FloorEditor({ building, floor, onSave, onDelete }: { building: Building; floor?: FloorGroup; onSave: (draft: FloorDraft) => Promise<void>; onDelete?: () => void }) {
  const [floorLabels, setFloorLabels] = useState(floor?.floorLabels ?? [""]);
  const [raNames, setRaNames] = useState(floor?.floorLabels.map((_, index) => floor.raNames[index] ?? "") ?? [""]);
  const [startDate, setStartDate] = useState(floor?.startDate ?? DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(floor?.endDate ?? DEFAULT_END_DATE);
  const [startHour, setStartHour] = useState(floor?.startHour ?? 9);
  const [endHour, setEndHour] = useState(floor?.endHour ?? 21);
  const [singleSuiteDuration, setSingleSuiteDuration] = useState(floor?.singleSuiteDuration ?? 2);
  const [connectedSuiteDuration, setConnectedSuiteDuration] = useState(floor?.connectedSuiteDuration ?? 3);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const timeOptions = Array.from({ length: 17 }, (_, index) => index + 8);
  const durationOptions = Array.from({ length: 12 }, (_, index) => (index + 1) / 2);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const assignments = floorLabels
      .map((label, index) => ({ label: label.trim(), raName: (raNames[index] ?? "").trim() }))
      .filter((assignment) => assignment.label);
    const cleanedLabels = assignments.map((assignment) => assignment.label);
    const cleanedRaNames = assignments.map((assignment) => assignment.raName);
    if (!cleanedLabels.length) return setError("Add at least one floor.");
    if (new Set(cleanedLabels).size !== cleanedLabels.length) return setError("Each floor must have a different name.");
    if (startDate > endDate) return setError("The end date must be on or after the start date.");
    if (startHour >= endHour) return setError("The latest time must be after the earliest time.");
    setSaving(true);
    setError("");
    try {
      const prefix = cleanedLabels[0].match(/\d+/)?.[0].slice(0, 2).padStart(2, "0") ?? cleanedLabels[0].slice(0, 2);
      await onSave({ label: cleanedLabels.join(" / "), floorLabels: cleanedLabels, raNames: cleanedRaNames, suitePrefix: prefix, startDate, endDate, startHour, endHour, singleSuiteDuration, connectedSuiteDuration });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return <form className="floor-editor" onSubmit={submit}>
    <p className="context-label">{building.name.toLowerCase()}</p>
    <h2>{floor ? "edit floor settings:" : "create new floor(s):"}</h2>
    <div className="floor-form-grid">
      <span className="floor-field-label">floor(s):</span>
      <div className="floor-assignment-inputs">
        {floorLabels.map((label, index) => <div className="floor-assignment-row" key={index}>
          <span>
            <input className="floor-number-input" value={label} onChange={(event) => setFloorLabels((values) => values.map((value, valueIndex) => valueIndex === index ? event.target.value.slice(0, 6) : value))} placeholder="floor" aria-label={`Floor ${index + 1}`} />
            {floorLabels.length > 1 && <button type="button" className="field-remove" onClick={() => { setFloorLabels((values) => values.filter((_, valueIndex) => valueIndex !== index)); setRaNames((values) => values.filter((_, valueIndex) => valueIndex !== index)); }} aria-label={`Remove floor ${label || index + 1}`}><CloseIcon /></button>}
          </span>
          <input className="ra-name-input" value={raNames[index] ?? ""} onChange={(event) => setRaNames((values) => values.map((value, valueIndex) => valueIndex === index ? event.target.value.slice(0, 80) : value))} placeholder="RA name (optional)" aria-label={`RA name for floor ${label || index + 1}`} />
        </div>)}
        {floorLabels.length < 3 && <button type="button" className="field-add" onClick={() => { setFloorLabels((values) => [...values, ""]); setRaNames((values) => [...values, ""]); }} aria-label="Add another floor"><PlusIcon /></button>}
      </div>
      <label htmlFor="floor-start-date">start date:</label><input id="floor-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      <label htmlFor="floor-end-date">end date:</label><input id="floor-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      <label htmlFor="floor-start-time">earliest time:</label><select id="floor-start-time" value={startHour} onChange={(event) => setStartHour(Number(event.target.value))}>{timeOptions.slice(0, -1).map((hour) => <option value={hour} key={hour}>{hourLabel(hour)}</option>)}</select>
      <label htmlFor="floor-end-time">latest time:</label><select id="floor-end-time" value={endHour} onChange={(event) => setEndHour(Number(event.target.value))}>{timeOptions.slice(1).map((hour) => <option value={hour} key={hour}>{hourLabel(hour)}</option>)}</select>
      <label htmlFor="single-suite-duration">single-suite appointment:</label><select id="single-suite-duration" value={singleSuiteDuration} onChange={(event) => setSingleSuiteDuration(Number(event.target.value))}>{durationOptions.map((duration) => <option value={duration} key={duration}>{durationLabel(duration)}</option>)}</select>
      <label htmlFor="connected-suite-duration">connected-suite appointment:</label><select id="connected-suite-duration" value={connectedSuiteDuration} onChange={(event) => setConnectedSuiteDuration(Number(event.target.value))}>{durationOptions.map((duration) => <option value={duration} key={duration}>{durationLabel(duration)}</option>)}</select>
      <span aria-hidden="true" /><small className="floor-setting-note">Changes apply to new bookings only.</small>
    </div>
    {error && <p className="error-text floor-form-error">{error}</p>}
    <button className="floor-save" disabled={saving}>{saving ? "saving…" : floor ? "save changes" : "create"}</button>
    {onDelete && <button className="floor-delete" type="button" onClick={onDelete}>delete floor</button>}
  </form>;
}

function ConfirmModal({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title"><h3 id="confirmation-title">{title}</h3><p>{description}</p><div><button type="button" onClick={onCancel}>cancel</button><button type="button" className="confirm-delete" onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}

function CalendarGrid({ snapshot, floor, floorLabels, selected, selectedDuration = 2, invalidCells = [], hiddenBookingId, preferredSuiteId, variant = "overview", onCell }: { snapshot: SchedulerSnapshot; floor: FloorGroup; floorLabels: string[]; selected?: { date: string; hour: number } | null; selectedDuration?: number; invalidCells?: string[]; hiddenBookingId?: string; preferredSuiteId?: string; variant?: "overview" | "availability" | "booking" | "receipt"; onCell?: (date: string, hour: number, makeUnavailable?: boolean) => void }) {
  const dates = useMemo(() => buildCalendarDates(floor.startDate, floor.endDate), [floor.startDate, floor.endDate]);
  const [daysPerPage, setDaysPerPage] = useState(7);
  const selectedDate = selected?.date;
  const [pageIndex, setPageIndex] = useState(() => {
    const selectedIndex = selected ? dates.findIndex((date) => date.iso === selected.date) : 0;
    return Math.max(0, Math.floor(selectedIndex / 7));
  });
  const paint = useRef<{ active: boolean; makeUnavailable: boolean; visited: Set<string> }>({ active: false, makeUnavailable: false, visited: new Set() });
  useEffect(() => {
    const stopPainting = () => { paint.current.active = false; paint.current.visited.clear(); };
    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("pointercancel", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("pointercancel", stopPainting);
    };
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const updatePageSize = () => {
      const nextPageSize = query.matches ? 3 : 7;
      const selectedIndex = selectedDate ? dates.findIndex((date) => date.iso === selectedDate) : 0;
      setDaysPerPage(nextPageSize);
      setPageIndex(Math.max(0, Math.floor(Math.max(0, selectedIndex) / nextPageSize)));
    };
    updatePageSize();
    query.addEventListener("change", updatePageSize);
    return () => query.removeEventListener("change", updatePageSize);
  }, [dates, selectedDate]);
  const pageCount = Math.ceil(dates.length / daysPerPage);
  const visibleDates = dates.slice(pageIndex * daysPerPage, pageIndex * daysPerPage + daysPerPage);
  while (visibleDates.length && visibleDates.length < daysPerPage) {
    const lastDate = new Date(`${visibleDates.at(-1)!.iso}T00:00:00Z`);
    lastDate.setUTCDate(lastDate.getUTCDate() + 1);
    const iso = `${lastDate.getUTCFullYear()}-${String(lastDate.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDate.getUTCDate()).padStart(2, "0")}`;
    visibleDates.push(describeDate(iso, false));
  }
  const calendarHours = Array.from({ length: Math.max(1, (floor.endHour - floor.startHour) * 2) }, (_, index) => floor.startHour + index / 2);
  const suitesForBooking = (booking: Booking) => snapshot.suites.filter((suite) => booking.suiteIds.includes(suite.id));
  const bookingAt = (date: string, hour: number) => snapshot.bookings.find((booking) => booking.id !== hiddenBookingId && booking.floorGroupId === floor.id && suitesForBooking(booking).some((suite) => floorLabels.includes(suite.floorLabel)) && booking.date === date && hour >= booking.startHour && hour < booking.startHour + booking.duration);
  const displayedSuite = (booking?: Booking) => {
    if (!booking) return undefined;
    const bookedSuites = suitesForBooking(booking);
    return bookedSuites.find((bookedSuite) => bookedSuite.id === preferredSuiteId) ?? bookedSuites.find((bookedSuite) => floorLabels.includes(bookedSuite.floorLabel)) ?? bookedSuites[0];
  };
  return <div className="calendar-scroll">
    {pageCount > 1 && <button className="week-arrow previous" disabled={pageIndex === 0} onClick={() => setPageIndex((page) => page - 1)} aria-label="Previous dates"><ChevronIcon /></button>}
    {pageCount > 1 && <button className="week-arrow next" disabled={pageIndex === pageCount - 1} onClick={() => setPageIndex((page) => page + 1)} aria-label="Next dates"><ChevronIcon direction="right" /></button>}
    <div className={`calendar-grid ${variant}`} role="grid" aria-label="Appointment calendar" style={{ "--calendar-days": daysPerPage } as CSSProperties}>
    <div className="calendar-corner" />
    {visibleDates.map((date) => <div className={`date-head${date.inRange ? "" : " outside-range"}`} key={date.iso}><span>{date.short}</span><b>{date.day}</b></div>)}
    {calendarHours.map((hour) => <div className={`calendar-row ${Number.isInteger(hour) ? "full-hour" : "half-hour"}`} key={hour}><div className="time-label">{Number.isInteger(hour) ? hourLabel(hour) : ""}</div>{visibleDates.map((date) => {
      const booking = bookingAt(date.iso, hour);
      const outsideFloorDates = !date.inRange;
      const unavailable = outsideFloorDates || hour < floor.startHour || hour >= floor.endHour || floorLabels.some((floorLabel) => snapshot.unavailable.includes(`${floor.id}|${floorLabel}|${date.iso}|${hour}`));
      const isSelected = Boolean(selected && selected.date === date.iso && hour >= selected.hour && hour < selected.hour + selectedDuration);
      const isInvalid = invalidCells.includes(`${date.iso}|${hour}`);
      const className = ["calendar-cell", booking ? "booked" : "available", unavailable ? "unavailable" : "", isSelected ? "selected" : "", isInvalid ? "invalid" : "", variant === "availability" ? "editable" : ""].filter(Boolean).join(" ");
      const bookingSuite = displayedSuite(booking);
      const cellKey = `${date.iso}|${hour}`;
      const paintCell = (makeUnavailable: boolean) => {
        if (booking || outsideFloorDates || paint.current.visited.has(cellKey)) return;
        paint.current.visited.add(cellKey);
        onCell?.(date.iso, hour, makeUnavailable);
      };
      const continuePainting = () => { if (variant === "availability" && paint.current.active) paintCell(paint.current.makeUnavailable); };
      return <button type="button" className={className} key={`${date.iso}-${hour}`} onClick={(event) => { if (variant !== "availability") onCell?.(date.iso, hour); else if (event.detail === 0 && !booking && !outsideFloorDates) onCell?.(date.iso, hour, !unavailable); }} onPointerDown={(event) => { if (variant !== "availability" || booking || outsideFloorDates) return; event.preventDefault(); paint.current = { active: true, makeUnavailable: !unavailable, visited: new Set() }; paintCell(!unavailable); }} onPointerEnter={continuePainting} onPointerMove={continuePainting} disabled={!onCell} aria-label={`${date.long}, ${hourLabel(hour)}`}>{booking && hour === booking.startHour && variant !== "booking" && <span style={{ height: `calc(${booking.duration * 200}% + ${booking.duration * 2}px)` }}><b>{bookingSuite?.number}</b><small>{rangeLabel(booking.startHour, booking.duration)}<br />{bookingSuite?.floorLabel}th floor</small></span>}</button>;
    })}</div>)}
  </div></div>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [building, setBuilding] = useState<Building | null>(null);
  const [floor, setFloor] = useState<FloorGroup | null>(null);
  const [activeFloorLabel, setActiveFloorLabel] = useState("");
  const [suite, setSuite] = useState<Suite | null>(null);
  const [selected, setSelected] = useState<{ date: string; hour: number } | null>(null);
  const [currentBooking, setCurrentBooking] = useState<Booking | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [message, setMessage] = useState("");
  const [invalidCells, setInvalidCells] = useState<string[]>([]);
  const [checks, setChecks] = useState([false, false]);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [newSuite, setNewSuite] = useState("");
  const [suiteDrafts, setSuiteDrafts] = useState<SuiteDraft[]>([]);
  const [suiteSaving, setSuiteSaving] = useState(false);
  const [connectingSuiteId, setConnectingSuiteId] = useState<string | null>(null);
  const [connectionNumber, setConnectionNumber] = useState("");
  const [deleteFloorOpen, setDeleteFloorOpen] = useState(false);
  const [deleteBookingOpen, setDeleteBookingOpen] = useState(false);
  const [suiteToDelete, setSuiteToDelete] = useState<Suite | null>(null);
  const [loadError, setLoadError] = useState("");
  const refreshInFlight = useRef<Promise<SchedulerSnapshot> | null>(null);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = schedulerApi.getSnapshot();
    refreshInFlight.current = request;
    try {
      const latest = await request;
      setSnapshot(latest);
      setBuilding((current) => current ? latest.buildings.find((item) => item.id === current.id) ?? current : current);
      setFloor((current) => current ? latest.floorGroups.find((item) => item.id === current.id) ?? current : current);
      setSuite((current) => current ? latest.suites.find((item) => item.id === current.id) ?? current : current);
      setCurrentBooking((current) => current ? latest.bookings.find((item) => item.id === current.id) ?? null : current);
      return latest;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);
  useEffect(() => {
    void refresh()
      .then((loaded) => {
        const sharedFloorId = new URL(window.location.href).searchParams.get("floor");
        if (!sharedFloorId) return;
        const sharedFloor = loaded.floorGroups.find((item) => item.id === sharedFloorId);
        const sharedBuilding = sharedFloor && loaded.buildings.find((item) => item.id === sharedFloor.buildingId);
        if (!sharedFloor || !sharedBuilding) {
          updateSharedFloorUrl(null, "replace");
          return;
        }
        setBuilding(sharedBuilding);
        setFloor(sharedFloor);
        setActiveFloorLabel(sharedFloor.floorLabels[0]);
        setScreen("calendar");
      })
      .catch((error: Error) => setLoadError(error.message));
  }, [refresh]);
  useEffect(() => {
    if (!snapshot || !AUTO_SYNC_SCREENS.has(screen)) return;
    let timer: number | undefined;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(sync, AUTO_SYNC_MIN_DELAY + Math.random() * AUTO_SYNC_JITTER);
    };
    const sync = () => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
      schedule();
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [refresh, screen, snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    const followBrowserHistory = () => {
      const sharedFloorId = new URL(window.location.href).searchParams.get("floor");
      const sharedFloor = snapshot.floorGroups.find((item) => item.id === sharedFloorId);
      const sharedBuilding = sharedFloor && snapshot.buildings.find((item) => item.id === sharedFloor.buildingId);
      if (sharedFloor && sharedBuilding) {
        setBuilding(sharedBuilding);
        setFloor(sharedFloor);
        setActiveFloorLabel(sharedFloor.floorLabels[0]);
        setScreen("calendar");
      } else {
        setBuilding(null);
        setFloor(null);
        setScreen("home");
      }
    };
    window.addEventListener("popstate", followBrowserHistory);
    return () => window.removeEventListener("popstate", followBrowserHistory);
  }, [snapshot]);
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);

  const buildingFloors = useMemo(() => snapshot?.floorGroups.filter((item) => item.buildingId === building?.id) ?? [], [snapshot, building]);
  const floorSuites = useMemo(() => snapshot?.suites.filter((item) => item.floorGroupId === floor?.id && item.floorLabel === activeFloorLabel) ?? [], [snapshot, floor, activeFloorLabel]);
  const duration = suite?.connectedSuiteId ? (floor?.connectedSuiteDuration ?? 3) : (floor?.singleSuiteDuration ?? 2);
  const connected = suite?.connectedSuiteId ? snapshot?.suites.find((item) => item.id === suite.connectedSuiteId) : undefined;
  const unbooked = floorSuites.filter((item) => !snapshot?.bookings.some((booking) => booking.suiteIds.includes(item.id)));
  const floorDates = useMemo(() => floor ? buildCalendarDates(floor.startDate, floor.endDate) : [], [floor]);

  if (!snapshot) return <main className="prototype"><div className="app-page loading">{loadError ? <><span>Could not load the scheduler.</span><small>{loadError}</small><button type="button" onClick={() => window.location.reload()}>try again</button></> : "LSA/RMA Scheduler"}</div></main>;

  const selectBuilding = (item: Building, admin = false) => { setBuilding(item); setScreen(admin ? "admin-floors" : "floors"); };
  const selectFloor = (item: FloorGroup, admin = false) => {
    setFloor(item);
    setActiveFloorLabel(item.floorLabels[0]);
    setMessage("");
    updateSharedFloorUrl(item.id);
    setScreen(admin ? "admin-calendar" : "calendar");
  };
  const selectSuite = (item: Suite) => {
    setSuite(item);
    const booking = snapshot.bookings.find((entry) => entry.suiteIds.includes(item.id)) ?? null;
    setCurrentBooking(booking);
    setSelected(booking ? { date: booking.date, hour: booking.startHour } : null);
    setInvalidCells([]);
    setChecks([false, false]);
    setMessage("");
    setScreen(booking ? "receipt" : "booking");
  };
  const beginSuiteEdit = (drafts = snapshot.suites.filter((item) => item.floorGroupId === floor?.id)) => {
    setSuiteDrafts(drafts.map((item) => ({ ...item })));
    setConnectingSuiteId(null);
    setConnectionNumber("");
    setNewSuite("");
    setMessage("");
    setScreen("admin-suites");
  };
  const stageConnection = (suiteId: string, connectedNumber: string) => {
    const source = suiteDrafts.find((item) => item.id === suiteId);
    const target = suiteDrafts.find((item) => item.floorGroupId === source?.floorGroupId && item.number === connectedNumber);
    if (!source || !target) throw new Error("Enter a suite number from this floor group.");
    if (source.id === target.id) throw new Error("A suite cannot connect to itself.");
    if (source.connectedSuiteId || target.connectedSuiteId) throw new Error("One of these suites already has a connection.");
    setSuiteDrafts((drafts) => drafts.map((item) => item.id === source.id
      ? { ...item, connectedSuiteId: target.id }
      : item.id === target.id ? { ...item, connectedSuiteId: source.id } : item));
  };
  const saveSuiteEdits = async () => {
    if (!floor) return;
    setSuiteSaving(true);
    setMessage("");
    try {
      const original = snapshot.suites.filter((item) => item.floorGroupId === floor.id);
      const retainedIds = new Set(suiteDrafts.filter((item) => !item.isNew).map((item) => item.id));

      for (const existing of original) {
        if (!retainedIds.has(existing.id)) await schedulerApi.deleteSuite(existing.id);
      }

      const resolvedIds = new Map<string, string>();
      for (const draft of suiteDrafts) {
        if (!draft.isNew) {
          resolvedIds.set(draft.id, draft.id);
          continue;
        }
        const created = await schedulerApi.addSuite({
          floorGroupId: draft.floorGroupId,
          floorLabel: draft.floorLabel,
          number: draft.number,
        });
        resolvedIds.set(draft.id, created.id);
      }

      const resolvedDrafts = suiteDrafts.map((draft): Suite => ({
        id: resolvedIds.get(draft.id)!,
        floorGroupId: draft.floorGroupId,
        floorLabel: draft.floorLabel,
        number: draft.number,
        ...(draft.connectedSuiteId && resolvedIds.has(draft.connectedSuiteId)
          ? { connectedSuiteId: resolvedIds.get(draft.connectedSuiteId)! }
          : {}),
      }));
      const desiredById = new Map(resolvedDrafts.map((item) => [item.id, item]));
      const disconnectedPairs = new Set<string>();

      for (const existing of original) {
        if (!retainedIds.has(existing.id) || !existing.connectedSuiteId) continue;
        if (desiredById.get(existing.id)?.connectedSuiteId === existing.connectedSuiteId) continue;
        const pairKey = [existing.id, existing.connectedSuiteId].sort().join("|");
        if (disconnectedPairs.has(pairKey)) continue;
        await schedulerApi.disconnectSuite(existing.id);
        disconnectedPairs.add(pairKey);
      }

      const originalById = new Map(original.map((item) => [item.id, item]));
      const connectedPairs = new Set<string>();
      for (const desired of resolvedDrafts) {
        if (!desired.connectedSuiteId) continue;
        const pairKey = [desired.id, desired.connectedSuiteId].sort().join("|");
        if (connectedPairs.has(pairKey)) continue;
        connectedPairs.add(pairKey);
        if (originalById.get(desired.id)?.connectedSuiteId === desired.connectedSuiteId) continue;
        const partner = desiredById.get(desired.connectedSuiteId);
        if (!partner) continue;
        await schedulerApi.connectSuites(desired.id, partner.number);
      }

      await refresh();
      setConnectingSuiteId(null);
      setConnectionNumber("");
      setScreen("admin-calendar");
    } catch (error) {
      const latest = await refresh().catch(() => null);
      if (latest) setSuiteDrafts(latest.suites.filter((item) => item.floorGroupId === floor.id).map((item) => ({ ...item })));
      setMessage(`${(error as Error).message} Refreshing the editor to match saved data.`);
    } finally {
      setSuiteSaving(false);
    }
  };
  const blockedCells = (date: string, hour: number) => {
    const blocked: string[] = [];
    const relevantFloors = [suite!.floorLabel, ...(connected ? [connected.floorLabel] : [])];
    for (let offset = 0; offset < duration * 2; offset += 1) {
      const currentHour = hour + offset / 2;
      const outsideSchedule = date < floor!.startDate || date > floor!.endDate || currentHour < floor!.startHour;
      const unavailable = outsideSchedule || relevantFloors.some((floorLabel) => snapshot.unavailable.includes(`${floor!.id}|${floorLabel}|${date}|${currentHour}`));
      const occupied = snapshot.bookings.some((booking) => {
        const bookedFloors = snapshot.suites.filter((item) => booking.suiteIds.includes(item.id)).map((item) => item.floorLabel);
        return booking.floorGroupId === floor!.id && bookedFloors.some((floorLabel) => relevantFloors.includes(floorLabel)) && booking.date === date && currentHour >= booking.startHour && currentHour < booking.startHour + booking.duration && booking.id !== currentBooking?.id;
      });
      if (unavailable || occupied || currentHour >= floor!.endHour) blocked.push(`${date}|${currentHour}`);
    }
    return blocked;
  };
  const chooseSlot = (date: string, hour: number) => {
    const blocked = blockedCells(date, hour);
    setSelected({ date, hour });
    setInvalidCells(blocked);
    setMessage(blocked.length ? "that time is not available, please pick another time." : "");
  };
  const createBooking = async () => {
    if (!selected || !suite || !floor) return;
    setBookingSaving(true);
    setMessage("");
    try {
      const booking = currentBooking
        ? await schedulerApi.updateBooking(currentBooking.id, selected.date, selected.hour)
        : await schedulerApi.createBooking({ suiteIds: [suite.id, ...(connected ? [connected.id] : [])], floorGroupId: floor.id, date: selected.date, startHour: selected.hour, duration });
      await refresh();
      setCurrentBooking(booking);
      setChecks([false, false]);
      setScreen("receipt");
    } catch (error) {
      setMessage((error as Error).message);
      void refresh().catch(() => undefined);
    } finally {
      setBookingSaving(false);
    }
  };
  const adminLogin = async () => {
    try {
      if (await schedulerApi.verifyAdminPin(pin)) { setPinError(""); setScreen("admin-buildings"); }
      else setPinError("incorrect pin");
    } catch (error) {
      setPinError((error as Error).message);
    }
  };
  const exitAdmin = () => { void schedulerApi.logoutAdmin().catch(() => undefined); setPin(""); setPinError(""); updateSharedFloorUrl(null, "replace"); setScreen("home"); };
  const warning = <p className="policy-note">Appointments are {durationLabel(floor?.singleSuiteDuration ?? 2)} for single-floor suites and {durationLabel(floor?.connectedSuiteDuration ?? 3)} for connecting suites. <strong>All members of the suite must be present for the FULL duration.</strong><br />If no timeslots are available or work for your suite, contact your RA to schedule your time manually.</p>;

  if (screen === "home") return <main className="prototype"><section className="app-page home-page"><div className="home-center"><h1>LSA/RMA Scheduler</h1><button onClick={() => setScreen("buildings")}>get started</button></div><button className="admin-login-link" onClick={() => { setPin(""); setPinError(""); setScreen("admin-pin"); }}>admin login</button></section></main>;

  if (screen === "admin-pin") return <main className="prototype"><section className="app-page"><Header onBack={() => { setPin(""); setPinError(""); setScreen("home"); }} /><form className="pin-panel" onSubmit={(event) => { event.preventDefault(); adminLogin(); }}><h2>enter pin:</h2><div className="pin-entry"><div className="pin-boxes">{[0,1,2,3].map((index) => <span className={index === Math.min(pin.length, 3) ? "active" : ""} key={index}>{pin[index] ? "•" : ""}</span>)}</div><input aria-label="Four digit admin pin" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0,4)); setPinError(""); }} inputMode="numeric" maxLength={4} /></div><button type="submit">log in</button><p className={`pin-error${pinError ? " visible" : ""}`} role="status" aria-live="polite">{pinError || "incorrect pin"}</p></form></section></main>;

  if (screen === "buildings" || screen === "admin-buildings") {
    const admin = screen === "admin-buildings";
    return <main className="prototype"><section className="app-page"><Header admin={admin} onExit={exitAdmin} onBack={() => setScreen("home")} /><div className="center-selection"><h2>select your building:</h2><BuildingButtons buildings={snapshot.buildings} onSelect={(item) => selectBuilding(item, admin)} /></div></section></main>;
  }

  if (screen === "floors" || screen === "admin-floors") {
    const admin = screen === "admin-floors";
    return <main className="prototype"><section className="app-page"><Header admin={admin} onExit={exitAdmin} onBack={() => setScreen(admin ? "admin-buildings" : "buildings")} /><div className="center-selection"><p className="context-label">{building?.name.toLowerCase()}</p><h2>select your floor:</h2><div className="floor-buttons">{buildingFloors.map((item) => { const raSummary = raSummaryFor(item); return <button key={item.id} onClick={() => selectFloor(item, admin)}><b>{item.label}</b>{raSummary && <small>{raSummary}</small>}</button>; })}{admin && <button className="add-button icon-only-button" onClick={() => { setMessage(""); setScreen("admin-create-floor"); }} aria-label="Create a floor"><PlusIcon /></button>}</div>{!buildingFloors.length && <p className="empty-state">{admin ? "there are no floors yet. use the + button to create one." : <>there are currently no floors available for this building.<br />please contact your RA.</>}</p>}</div></section></main>;
  }

  if (screen === "admin-create-floor" && building) return <main className="prototype"><section className="app-page"><Header admin onExit={exitAdmin} onBack={() => setScreen("admin-floors")} /><FloorEditor building={building} onSave={async (draft) => { const created = await schedulerApi.addFloorGroup({ ...draft, buildingId: building.id }); await refresh(); setFloor(created); setActiveFloorLabel(created.floorLabels[0]); updateSharedFloorUrl(created.id); beginSuiteEdit([]); }} /></section></main>;

  if (screen === "admin-edit-floor" && building && floor) return <main className="prototype"><section className="app-page"><Header admin onExit={exitAdmin} onBack={() => setScreen("admin-calendar")} /><FloorEditor key={floor.id} building={building} floor={floor} onSave={async (draft) => { const updated = await schedulerApi.updateFloorGroup(floor.id, draft); await refresh(); setFloor(updated); setActiveFloorLabel((label) => updated.floorLabels.includes(label) ? label : updated.floorLabels[0]); setScreen("admin-calendar"); }} onDelete={() => setDeleteFloorOpen(true)} />{deleteFloorOpen && <ConfirmModal title="delete this floor?" description={`This will permanently delete every suite, booking, and availability setting for ${floor.label}.`} confirmLabel="yes, delete everything" onCancel={() => setDeleteFloorOpen(false)} onConfirm={async () => { await schedulerApi.deleteFloorGroup(floor.id); await refresh(); setDeleteFloorOpen(false); setFloor(null); updateSharedFloorUrl(null); setScreen("admin-floors"); }} />}</section></main>;

  if (screen === "calendar") return <main className="prototype"><section className="app-page calendar-page"><Header onBack={() => { updateSharedFloorUrl(null); setScreen("floors"); }} /><div className="calendar-title"><span>{building?.name.toLowerCase()}</span><FloorSwitch floor={floor!} active={activeFloorLabel} onChange={setActiveFloorLabel} /></div><div className="calendar-layout"><aside><p>not booked yet:</p>{unbooked.map((item) => <span key={item.id}>{item.number}</span>)}{!unbooked.length && <small className="empty-inline">all suites booked</small>}<button onClick={() => setScreen("suites")}>book/edit</button></aside><CalendarGrid snapshot={snapshot} floor={floor!} floorLabels={[activeFloorLabel]} /></div>{warning}</section></main>;

  if (screen === "suites") return <main className="prototype"><section className="app-page"><Header onBack={() => setScreen("calendar")} /><div className="center-selection"><p className="context-label">{building?.name.toLowerCase()}</p><FloorSwitch floor={floor!} active={activeFloorLabel} onChange={setActiveFloorLabel} /><h2>select your suite:</h2><div className="suite-buttons">{floorSuites.map((item) => <button key={item.id} onClick={() => selectSuite(item)}><b>{item.number}</b>{item.connectedSuiteId && <small>connected to {snapshot.suites.find((entry) => entry.id === item.connectedSuiteId)?.number}</small>}</button>)}</div>{!floorSuites.length && <p className="empty-state">there are currently no suites available for this floor.<br />please contact your RA.</p>}</div>{warning}</section></main>;

  if (screen === "booking") return <main className="prototype"><section className="app-page calendar-page"><Header onBack={() => setScreen("suites")} /><div className="calendar-title suite-title"><span>{building?.name.toLowerCase()}</span><h2>suite {suite?.number}</h2>{connected && <small>connected to {connected.number}</small>}</div><div className="calendar-layout"><aside>{selected ? <><p>selecting:</p><span className="selected-copy">{floorDates.find((date) => date.iso === selected.date)?.long}<br />{rangeLabel(selected.hour, duration)}</span>{invalidCells.length ? <p className="error-text booking-error">{message}</p> : <button onClick={() => { setChecks([false, false]); setMessage(""); setScreen("confirm"); }}>confirm</button>}</> : <p>select a time</p>}</aside><CalendarGrid snapshot={snapshot} floor={floor!} floorLabels={[suite!.floorLabel, ...(connected ? [connected.floorLabel] : [])]} selected={selected} selectedDuration={duration} invalidCells={invalidCells} hiddenBookingId={currentBooking?.id} variant="booking" onCell={chooseSlot} /></div>{warning}</section></main>;

  if (screen === "confirm" && selected) {
    const date = floorDates.find((item) => item.iso === selected.date) ?? describeDate(selected.date);
    return <main className="prototype"><section className="app-page"><Header onBack={() => setScreen("booking")} /><div className="confirmation"><h2>you are booking:</h2><div className="booking-summary"><p>{date.long}<br />{date.weekday}<br />{rangeLabel(selected.hour, duration)}</p><span>for</span><p>Suite {suite?.number}{connected && <><br />AND<br />Suite {connected.number}</>}</p></div><div className="confirmation-checks"><label htmlFor="all-residents-agree" aria-label="This meeting time works for all residents"><input id="all-residents-agree" type="checkbox" checked={checks[0]} onChange={(event) => setChecks([event.target.checked, checks[1]])} /><span><b>This meeting time works for ALL residents of the listed suites.</b>{connected && <small>If you are in a connected suite, this booking is for all residents of BOTH floors.</small>}</span></label><label htmlFor="full-duration-agree" aria-label="All residents will be present for the full duration"><input id="full-duration-agree" type="checkbox" checked={checks[1]} onChange={(event) => setChecks([checks[0], event.target.checked])} /><span><b>ALL residents will be present for the full duration selected.</b><small>This appointment is {durationLabel(duration)} long.</small></span></label></div>{message && <p className="error-text confirmation-error" role="status">{message}</p>}<button disabled={!checks.every(Boolean) || bookingSaving} onClick={createBooking}>{bookingSaving ? "saving…" : "confirm"}</button></div><p className="contact-note">If no timeslots are available or work for your suite, contact your RA to schedule your time manually.</p></section></main>;
  }

  if (screen === "receipt" && currentBooking) {
    const date = floorDates.find((item) => item.iso === currentBooking.date) ?? describeDate(currentBooking.date);
    return <main className="prototype"><section className="app-page calendar-page"><Header onBack={() => setScreen("suites")} /><div className="calendar-title suite-title"><span>{building?.name.toLowerCase()}</span><h2>suite {suite?.number}</h2>{connected && <small>connected to {connected.number}</small>}</div><div className="calendar-layout"><aside><p>booked:</p><span className="booked-copy">{date.long}<br />{date.weekday}<br />{rangeLabel(currentBooking.startHour, currentBooking.duration)}</span><p>meet in the common<br />space of your suite.</p><button onClick={() => setScreen("booking")}>edit</button><button className="delete-link" onClick={() => setDeleteBookingOpen(true)}>delete booking</button></aside><CalendarGrid snapshot={snapshot} floor={floor!} floorLabels={[suite!.floorLabel, ...(connected ? [connected.floorLabel] : [])]} selected={{ date: currentBooking.date, hour: currentBooking.startHour }} selectedDuration={currentBooking.duration} preferredSuiteId={suite!.id} variant="receipt" /></div>{warning}{deleteBookingOpen && <ConfirmModal title="delete this booking?" description={`This will permanently remove the booking for suite ${suite?.number} on ${date.long}.`} confirmLabel="yes, delete booking" onCancel={() => setDeleteBookingOpen(false)} onConfirm={async () => { await schedulerApi.deleteBooking(currentBooking.id); await refresh(); setDeleteBookingOpen(false); setCurrentBooking(null); setScreen("calendar"); }} />}</section></main>;
  }

  if (screen === "admin-calendar") return <main className="prototype"><section className="app-page calendar-page"><Header admin onExit={exitAdmin} onBack={() => { updateSharedFloorUrl(null); setScreen("admin-floors"); }} /><div className="calendar-title admin-calendar-title"><span>{building?.name.toLowerCase()}</span><FloorSwitch floor={floor!} active={activeFloorLabel} onChange={setActiveFloorLabel} /><AdminSettings onEditSuites={() => beginSuiteEdit()} onEditFloor={() => { setMessage(""); setScreen("admin-edit-floor"); }} /></div><div className="calendar-layout"><aside><p>not booked yet:</p>{unbooked.map((item) => <span key={item.id}>{item.number}</span>)}{!unbooked.length && <small className="empty-inline">all suites booked</small>}</aside><CalendarGrid snapshot={snapshot} floor={floor!} floorLabels={[activeFloorLabel]} variant="availability" onCell={async (date, hour, makeUnavailable) => { const key = `${floor!.id}|${activeFloorLabel}|${date}|${hour}`; const desiredState = makeUnavailable ?? !snapshot.unavailable.includes(key); setSnapshot((current) => current ? { ...current, unavailable: desiredState ? [...new Set([...current.unavailable, key])] : current.unavailable.filter((item) => item !== key) } : current); try { await schedulerApi.setAvailability(floor!.id, activeFloorLabel, date, hour, desiredState); setMessage(""); } catch (error) { setMessage((error as Error).message); await refresh(); } }} /></div><p className="availability-hint">blue = available · click or drag across boxes to change availability</p>{message && <p className="calendar-error">{message}</p>}</section></main>;

  const editableFloorSuites = suiteDrafts.filter((item) => item.floorGroupId === floor?.id && item.floorLabel === activeFloorLabel);
  return <main className="prototype"><section className="app-page"><Header admin onExit={exitAdmin} onBack={() => { setSuiteDrafts([]); setSuiteToDelete(null); setConnectingSuiteId(null); setConnectionNumber(""); setMessage(""); setScreen("admin-calendar"); }} /><div className="center-selection suite-editor-panel"><p className="context-label">{building?.name.toLowerCase()}</p><FloorSwitch floor={floor!} active={activeFloorLabel} onChange={(label) => { setActiveFloorLabel(label); setConnectingSuiteId(null); setConnectionNumber(""); setMessage(""); }} /><h2>add/edit suites:</h2><div className="suite-editor">{editableFloorSuites.map((item) => {
    const connectedSuite = item.connectedSuiteId ? suiteDrafts.find((entry) => entry.id === item.connectedSuiteId) : undefined;
    const connecting = connectingSuiteId === item.id;
    return <div className="suite-editor-row" key={item.id}><span>{item.number}</span>{connecting ? <input className="connection-input" value={connectionNumber} onChange={(event) => setConnectionNumber(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="suite number" aria-label={`Connect suite ${item.number} to`} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); try { stageConnection(item.id, connectionNumber); setConnectingSuiteId(null); setConnectionNumber(""); setMessage(""); } catch (error) { setMessage((error as Error).message); } } }} /> : <small>{connectedSuite ? `connected to ${connectedSuite.number}` : ""}</small>}<button className="suite-icon" type="button" aria-label={connectedSuite ? `Disconnect suite ${item.number}` : connecting ? `Confirm connection for suite ${item.number}` : `Connect suite ${item.number}`} onClick={() => { try { if (connectedSuite) { setSuiteDrafts((drafts) => drafts.map((draft) => draft.id === item.id || draft.id === connectedSuite.id ? { ...draft, connectedSuiteId: undefined } : draft)); } else if (connecting) { stageConnection(item.id, connectionNumber); setConnectingSuiteId(null); setConnectionNumber(""); } else { setConnectingSuiteId(item.id); setConnectionNumber(""); return; } setMessage(""); } catch (error) { setMessage((error as Error).message); } }}>{connectedSuite ? <svg className="unlink-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 14.5-2 2a3.5 3.5 0 0 1-5-5l2-2M14.5 9.5l2-2a3.5 3.5 0 0 1 5 5l-2 2M8 12h2M14 12h2M5 3l14 18" /></svg> : connecting ? <svg className="simple-action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.3 3.2 7.7-7.5" /></svg> : <PlusIcon />}</button><button className="suite-icon suite-remove" type="button" aria-label={`Delete suite ${item.number}`} onClick={() => setSuiteToDelete(item)}><CloseIcon /></button></div>;
  })}{!editableFloorSuites.length && <p className="suite-editor-empty">no suites yet</p>}<form className="suite-add-row" onSubmit={(event) => { event.preventDefault(); const expectedPrefix = activeFloorLabel.match(/\d+/)?.[0].slice(0, 2).padStart(2, "0") ?? ""; if (!newSuite.startsWith(expectedPrefix)) { setMessage(`suite numbers for this floor must begin with ${expectedPrefix}`); return; } if (suiteDrafts.some((item) => item.floorGroupId === floor!.id && item.floorLabel === activeFloorLabel && item.number === newSuite)) { setMessage("that suite already exists on this floor"); return; } setSuiteDrafts((drafts) => [...drafts, { id: `new-${crypto.randomUUID()}`, number: newSuite, floorGroupId: floor!.id, floorLabel: activeFloorLabel, isNew: true }]); setNewSuite(""); setMessage(""); }}><input value={newSuite} onChange={(event) => setNewSuite(event.target.value.replace(/\D/g, "").slice(0,4))} placeholder={`${activeFloorLabel.match(/\d+/)?.[0].slice(0, 2).padStart(2, "0") ?? floor?.suitePrefix}XX`} aria-label="New suite number" /><span /><span /><button className="suite-icon" aria-label="Add suite"><PlusIcon /></button></form></div>{message && <p className="error-text suite-editor-error">{message}</p>}<button className="suite-editor-save" type="button" disabled={suiteSaving} onClick={saveSuiteEdits}>{suiteSaving ? "saving…" : "save changes"}</button></div>{suiteToDelete && <ConfirmModal title="delete this suite?" description={`This will remove suite ${suiteToDelete.number}${suiteToDelete.connectedSuiteId ? " and break its suite connection" : ""} when you save changes.`} confirmLabel="remove suite" onCancel={() => setSuiteToDelete(null)} onConfirm={() => { const removedId = suiteToDelete.id; const connectedId = suiteToDelete.connectedSuiteId; setSuiteDrafts((drafts) => drafts.filter((draft) => draft.id !== removedId).map((draft) => draft.id === connectedId ? { ...draft, connectedSuiteId: undefined } : draft)); setSuiteToDelete(null); setMessage(""); }} />}</section></main>;
}

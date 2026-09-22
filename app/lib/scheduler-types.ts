export type Building = {
  id: string;
  name: string;
  tone: "blue" | "gold" | "peach" | "green";
};

export type FloorGroup = {
  id: string;
  buildingId: string;
  label: string;
  floorLabels: string[];
  raNames: string[];
  suitePrefix: string;
  startDate: string;
  endDate: string;
  startHour: number;
  endHour: number;
  singleSuiteDuration: number;
  connectedSuiteDuration: number;
};

export type Suite = {
  id: string;
  floorGroupId: string;
  floorLabel: string;
  number: string;
  connectedSuiteId?: string;
};

export type Booking = {
  id: string;
  suiteIds: string[];
  floorGroupId: string;
  date: string;
  startHour: number;
  duration: number;
};

export type SchedulerSnapshot = {
  buildings: Building[];
  floorGroups: FloorGroup[];
  suites: Suite[];
  bookings: Booking[];
  unavailable: string[];
};

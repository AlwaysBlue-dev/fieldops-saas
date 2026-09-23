import { apiRequest } from "./api";
import type { LocationEvidence } from "./location";
import type { JobPriority, JobStatus } from "./schedule";

export type MyDayJobActions = {
  canClockIn: boolean;
  canClockOut: boolean;
  canOpen: boolean;
  canAddWorkUpdate: boolean;
  canAddPhoto: boolean;
  canAddMaterial: boolean;
  canSignOff: boolean;
};

export type MyDayJob = {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  expectedFinish: string | null;
  scopeSummary: string | null;
  client: { id: string; name: string };
  site: {
    id: string;
    name: string;
    addressLabel: string | null;
    city: string | null;
    latitude: string | null;
    longitude: string | null;
  };
  siteContact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  navigationUrl: string | null;
  actions: MyDayJobActions;
};

export type MyDayPayload = {
  serverNow: string;
  shift: {
    date: string;
    weekday: string;
    timeZone: string;
    isWorkingDay: boolean;
    dailyHoursLimit: number;
  };
  clock: {
    status: "CLOCKED_IN" | "CLOCKED_OUT";
    session: ClockSessionView | null;
  };
  currentJob: MyDayJob | null;
  upcomingJobs: MyDayJob[];
  actions: { canClockIn: boolean; canClockOut: boolean };
  settings: {
    requireGps: boolean;
    requireClientSignature: boolean;
    gpsReviewDistanceMeters: number;
  };
};

export type ClockSessionView = {
  id: string;
  jobId: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  clockInEvidence: LocationEvidence | null;
  clockOutEvidence: LocationEvidence | null;
};

export type GpsPayload = {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

export function getMyDay(organizationId: string) {
  return apiRequest<MyDayPayload>(`/organizations/${organizationId}/my-day`);
}

export function clockIn(
  organizationId: string,
  body: GpsPayload & { jobId?: string } = {},
) {
  return apiRequest(`/organizations/${organizationId}/my-day/clock-in`, {
    method: "POST",
    body,
  });
}

export function clockOut(organizationId: string, body: GpsPayload = {}) {
  return apiRequest(`/organizations/${organizationId}/my-day/clock-out`, {
    method: "POST",
    body,
  });
}

export function addWorkUpdate(
  organizationId: string,
  jobId: string,
  body: string,
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/work-logs`, {
    method: "POST",
    body: { body },
  });
}

export function addJobMaterial(
  organizationId: string,
  jobId: string,
  input: { name: string; quantity: number; unit: string; notes?: string },
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/materials`, {
    method: "POST",
    body: input,
  });
}

export function addJobPhoto(
  organizationId: string,
  jobId: string,
  input: { fileName: string; mimeType: string; contentBase64: string },
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/photos`, {
    method: "POST",
    body: input,
  });
}

export function addJobSignature(
  organizationId: string,
  jobId: string,
  input: { signerName: string; signerTitle?: string; imageBase64: string },
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/signatures`, {
    method: "POST",
    body: input,
  });
}

export function weekdayLabel(code: string) {
  const labels: Record<string, string> = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday",
  };
  return labels[code] ?? code;
}

export async function readGps(): Promise<GpsPayload | undefined> {
  if (!navigator.geolocation) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export type LocationStatus =
  | "NEAR_SITE"
  | "LOCATION_REVIEW"
  | "NO_SITE_LOCATION"
  | "LOW_ACCURACY"
  | "NO_GPS";

export type LocationEvidence = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceFromSiteMeters: number | null;
  locationStatus: LocationStatus;
  mapsUrl: string | null;
};

export function locationStatusLabel(status: LocationStatus) {
  switch (status) {
    case "NEAR_SITE":
      return "Near site";
    case "LOCATION_REVIEW":
      return "Location review";
    case "NO_SITE_LOCATION":
      return "No site coordinates";
    case "LOW_ACCURACY":
      return "Low GPS accuracy";
    case "NO_GPS":
      return "No GPS";
  }
}

export function locationStatusTone(
  status: LocationStatus,
): "teal" | "amber" | "muted" {
  if (status === "NEAR_SITE") return "teal";
  if (status === "LOCATION_REVIEW" || status === "LOW_ACCURACY") return "amber";
  return "muted";
}

export function formatDistanceFromSite(meters: number | null) {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.round(meters)} m from site`;
  return `${(meters / 1000).toFixed(1)} km from site`;
}

export function formatAccuracy(meters: number | null) {
  if (meters == null) return null;
  return `Accuracy ±${Math.round(meters)} m`;
}

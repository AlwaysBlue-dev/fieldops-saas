export const DEFAULT_GPS_REVIEW_DISTANCE_METERS = 250;
export const EARTH_RADIUS_METERS = 6_371_000;

export const LOCATION_STATUSES = [
  'NEAR_SITE',
  'LOCATION_REVIEW',
  'NO_SITE_LOCATION',
  'LOW_ACCURACY',
  'NO_GPS',
] as const;

export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

export type LocationEvidence = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceFromSiteMeters: number | null;
  locationStatus: LocationStatus;
  mapsUrl: string | null;
};

export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function assertCoordinatePair(
  latitude?: number | null,
  longitude?: number | null,
) {
  const hasLat = latitude != null;
  const hasLng = longitude != null;
  if (hasLat !== hasLng) {
    throw new Error('Latitude and longitude must be provided together');
  }
  if (!hasLat || !hasLng) return;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new Error('Coordinates are out of range');
  }
}

export function haversineMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

export function locationEvidence(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  siteLatitude?: number | null;
  siteLongitude?: number | null;
  reviewDistanceMeters?: number | null;
}): LocationEvidence {
  const latitude = toFiniteNumber(input.latitude);
  const longitude = toFiniteNumber(input.longitude);
  const accuracyMeters = toFiniteNumber(input.accuracyMeters);
  const siteLatitude = toFiniteNumber(input.siteLatitude);
  const siteLongitude = toFiniteNumber(input.siteLongitude);
  const threshold =
    input.reviewDistanceMeters && input.reviewDistanceMeters > 0
      ? input.reviewDistanceMeters
      : DEFAULT_GPS_REVIEW_DISTANCE_METERS;

  if (latitude == null || longitude == null) {
    return {
      latitude: null,
      longitude: null,
      accuracyMeters,
      distanceFromSiteMeters: null,
      locationStatus: 'NO_GPS',
      mapsUrl: null,
    };
  }

  const evidence: LocationEvidence = {
    latitude,
    longitude,
    accuracyMeters,
    distanceFromSiteMeters: null,
    locationStatus: 'NO_SITE_LOCATION',
    mapsUrl: mapsUrl(latitude, longitude),
  };

  if (siteLatitude == null || siteLongitude == null) {
    return evidence;
  }

  const distance = haversineMeters(
    { latitude, longitude },
    { latitude: siteLatitude, longitude: siteLongitude },
  );
  evidence.distanceFromSiteMeters = Math.round(distance);

  if (accuracyMeters != null && accuracyMeters > threshold) {
    evidence.locationStatus = 'LOW_ACCURACY';
    return evidence;
  }

  const adjusted = distance - (accuracyMeters ?? 0);
  evidence.locationStatus =
    adjusted <= threshold ? 'NEAR_SITE' : 'LOCATION_REVIEW';
  return evidence;
}

export function formatDistanceMeters(meters: number | null) {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Browser geolocation helpers with customer-friendly error mapping. */

export type GeolocationFailureKind =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported";

export type GeoCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type GeolocationUserFacing = {
  kind: GeolocationFailureKind;
  title: string;
  message: string;
  canRetry: boolean;
};

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 0,
};

export class GeolocationRequestError extends Error {
  readonly kind: GeolocationFailureKind;
  readonly title: string;
  readonly userMessage: string;
  readonly canRetry: boolean;
  /** Browser error code when available (for logging only). */
  readonly code?: number;

  constructor(input: GeolocationUserFacing & { code?: number }) {
    super(input.message);
    this.name = "GeolocationRequestError";
    this.kind = input.kind;
    this.title = input.title;
    this.userMessage = input.message;
    this.canRetry = input.canRetry;
    this.code = input.code;
  }
}

export function geolocationUserFacing(
  kind: GeolocationFailureKind,
): GeolocationUserFacing {
  switch (kind) {
    case "permission_denied":
      return {
        kind,
        title: "Location permission is turned off",
        message:
          "Please allow location access for FieldKeel in your browser or device settings, then try again.",
        canRetry: true,
      };
    case "position_unavailable":
      return {
        kind,
        title: "Location access is needed",
        message:
          "FieldKeel couldn't access your current location. Please turn on location services for your device and allow location access for FieldKeel, then try again.",
        canRetry: true,
      };
    case "timeout":
      return {
        kind,
        title: "Location is taking longer than expected",
        message:
          "We couldn't get your current location. Check that location services are enabled and try again.",
        canRetry: true,
      };
    case "unsupported":
      return {
        kind,
        title: "Location isn't available",
        message:
          "Your current browser or device cannot provide the location FieldKeel needs for this action. Try using a supported browser or device.",
        canRetry: false,
      };
  }
}

export function mapGeolocationPositionError(
  error: GeolocationPositionError,
): GeolocationRequestError {
  let kind: GeolocationFailureKind = "position_unavailable";
  if (error.code === error.PERMISSION_DENIED) {
    kind = "permission_denied";
  } else if (error.code === error.TIMEOUT) {
    kind = "timeout";
  } else if (error.code === error.POSITION_UNAVAILABLE) {
    kind = "position_unavailable";
  }
  const facing = geolocationUserFacing(kind);
  if (typeof console !== "undefined") {
    console.warn("[geolocation]", kind, error.code, error.message);
  }
  return new GeolocationRequestError({ ...facing, code: error.code });
}

export function unsupportedGeolocationError(): GeolocationRequestError {
  const facing = geolocationUserFacing("unsupported");
  if (typeof console !== "undefined") {
    console.warn("[geolocation]", "unsupported");
  }
  return new GeolocationRequestError(facing);
}

/**
 * Request the device's current position.
 * Rejects with GeolocationRequestError — never returns null for failures.
 */
export function getCurrentLocation(
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<GeoCoordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(unsupportedGeolocationError());
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        reject(mapGeolocationPositionError(error));
      },
      { ...DEFAULT_OPTIONS, ...options },
    );
  });
}

export function isGeolocationRequestError(
  err: unknown,
): err is GeolocationRequestError {
  return err instanceof GeolocationRequestError;
}

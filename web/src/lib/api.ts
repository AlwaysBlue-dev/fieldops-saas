const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const CSRF_HEADER = "X-FieldOps-Requested-With";
const CSRF_VALUE = "web";

export class ApiError extends Error {
  status: number;
  error?: string;
  code?: string;
  conflicts?: unknown;
  validation?: unknown;
  limitType?: string;
  used?: number | string;
  limit?: number | string;
  planCode?: string;
  planName?: string;
  existingOrganization?: {
    id: string;
    name: string;
    slug: string;
  };

  constructor(
    status: number,
    message: string,
    error?: string,
    conflicts?: unknown,
    validation?: unknown,
    extras?: {
      code?: string;
      limitType?: string;
      used?: number | string;
      limit?: number | string;
      planCode?: string;
      planName?: string;
      existingOrganization?: {
        id: string;
        name: string;
        slug: string;
      };
    },
  ) {
    super(message);
    this.status = status;
    this.error = error;
    this.conflicts = conflicts;
    this.validation = validation;
    this.code = extras?.code;
    this.limitType = extras?.limitType;
    this.used = extras?.used;
    this.limit = extras?.limit;
    this.planCode = extras?.planCode;
    this.planName = extras?.planName;
    this.existingOrganization = extras?.existingOrganization;
  }
}

/** Refresh token expired/revoked — distinct from network failures. */
export class SessionExpiredError extends ApiError {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(401, message, "Unauthorized", undefined, undefined, {
      code: "SESSION_EXPIRED",
    });
    this.name = "SessionExpiredError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Skip access-token refresh (used for /auth/refresh itself). */
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          [CSRF_HEADER]: CSRF_VALUE,
        },
      });
      return response.ok;
    } catch {
      throw new ApiError(
        0,
        "We couldn't reach the server. Check your connection and try again.",
        "NetworkError",
      );
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function parseErrorPayload(payload: {
  message?: string | string[];
  error?: string;
  conflicts?: unknown;
  validation?: unknown;
  code?: string;
  limitType?: string;
  used?: number | string;
  limit?: number | string;
  planCode?: string;
  planName?: string;
  existingOrganization?: {
    id: string;
    name: string;
    slug: string;
  };
} | null) {
  const message = Array.isArray(payload?.message)
    ? payload.message.join(", ")
    : payload?.message || "Request failed";
  return new ApiError(
    0,
    message,
    payload?.error,
    payload?.conflicts,
    payload?.validation,
    {
      code: payload?.code,
      limitType: payload?.limitType,
      used: payload?.used,
      limit: payload?.limit,
      planCode: payload?.planCode,
      planName: payload?.planName,
      existingOrganization: payload?.existingOrganization,
    },
  );
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const run = async (retried: boolean): Promise<T> => {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      headers.set(CSRF_HEADER, CSRF_VALUE);
    }

    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(
        0,
        "We couldn't reach the server. Check your connection and try again.",
        "NetworkError",
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          message?: string | string[];
          error?: string;
          conflicts?: unknown;
          validation?: unknown;
          code?: string;
          limitType?: string;
          used?: number | string;
          limit?: number | string;
          planCode?: string;
          planName?: string;
          existingOrganization?: {
            id: string;
            name: string;
            slug: string;
          };
        }
      | null;

    if (
      response.status === 401 &&
      !retried &&
      !options.skipAuthRefresh &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/signup") &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/forgot-password") &&
      !path.startsWith("/auth/reset-password")
    ) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return run(true);
      }
      throw new SessionExpiredError();
    }

    if (!response.ok) {
      const err = parseErrorPayload(payload);
      err.status = response.status;
      if (response.status === 401) {
        throw new SessionExpiredError(
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : undefined,
        );
      }
      throw err;
    }

    return payload as T;
  };

  return run(false);
}

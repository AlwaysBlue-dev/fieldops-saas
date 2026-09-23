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
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers.set(CSRF_HEADER, CSRF_VALUE);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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
      }
    | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : payload?.message || "Request failed";
    throw new ApiError(
      response.status,
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
      },
    );
  }

  return payload as T;
}

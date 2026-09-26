import { ApiError, SessionExpiredError } from "@/lib/api";

const EXACT: Record<string, string> = {
  "Invalid credentials":
    "That email or password doesn’t look right. Please try again.",
  "That email or password doesn’t look right. Please try again.":
    "That email or password doesn’t look right. Please try again.",
  "Account is inactive":
    "This account is inactive. Contact your organization admin for help.",
  "This account is inactive. Contact your organization admin for help.":
    "This account is inactive. Contact your organization admin for help.",
  "An account with this email already exists":
    "An account with this email already exists. Sign in, or use a different email.",
  "An account with this email already exists. Sign in, or use a different email.":
    "An account with this email already exists. Sign in, or use a different email.",
  "Your email address has not been verified.":
    "Your email address has not been verified yet. Check your inbox or resend the link.",
  "Your email address has not been verified yet. Check your inbox or resend the link.":
    "Your email address has not been verified yet. Check your inbox or resend the link.",
  "Trial plan is not configured":
    "We can’t start a workspace trial right now. Please try again later.",
  "We can’t start a workspace trial right now. Please try again later.":
    "We can’t start a workspace trial right now. Please try again later.",
  "Unable to create workspace":
    "We couldn’t create your workspace. Please try again in a moment.",
  "We couldn’t create your workspace. Please try again in a moment.":
    "We couldn’t create your workspace. Please try again in a moment.",
  "This verification link is invalid or has expired.":
    "This verification link is invalid or has expired. Request a new one below.",
  "This verification link is invalid or has expired. Request a new one below.":
    "This verification link is invalid or has expired. Request a new one below.",
  "This password reset link is invalid or has expired.":
    "This password reset link is invalid or has expired. Request a new one to continue.",
  "This password reset link is invalid or has expired. Request a new one to continue.":
    "This password reset link is invalid or has expired. Request a new one to continue.",
  "Passwords do not match.": "Those passwords don’t match. Please try again.",
  "Those passwords don’t match. Please try again.":
    "Those passwords don’t match. Please try again.",
  "This invitation was issued to a different email":
    "This invitation was sent to a different email address. Sign in with that email to continue.",
  "Sign in to accept this invitation":
    "Please sign in with the invited email to accept this invitation.",
  "Request failed": "Something went wrong. Please try again.",
  Unauthorized: "Please sign in again to continue.",
  Forbidden: "You don’t have permission to do that.",
  "Too Many Requests": "Too many attempts. Please wait a moment and try again.",
};

const PATTERNS: { test: RegExp; message: string }[] = [
  {
    test: /email.*(must be|valid)|must be an email/i,
    message: "Enter a valid work email address.",
  },
  {
    test: /password.*(longer|short|min|at least|characters)/i,
    message: "Password must be at least 10 characters.",
  },
  {
    test: /fullName|full name/i,
    message: "Enter your full name.",
  },
  {
    test: /organizationName|organization name|company/i,
    message: "Enter your company name.",
  },
  {
    test: /acceptTerms|agree to the Terms/i,
    message: "Please agree to the Terms of Service and Privacy Policy.",
  },
  {
    test: /throttl|too many/i,
    message: "Too many attempts. Please wait a moment and try again.",
  },
  {
    test: /network|failed to fetch|load failed/i,
    message: "We couldn’t reach the server. Check your connection and try again.",
  },
];

function normalizeRaw(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Something went wrong. Please try again.";
  if (EXACT[trimmed]) return EXACT[trimmed];
  for (const entry of PATTERNS) {
    if (entry.test.test(trimmed)) return entry.message;
  }
  // Drop Nest/class-validator noise like "password must be longer than or equal to 10 characters"
  if (/^[a-zA-Z0-9_.]+ (must|should) /i.test(trimmed)) {
    return "Please check the highlighted fields and try again.";
  }
  return trimmed;
}

export function friendlyErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof SessionExpiredError) {
    return err.message || "Your session has expired. Please sign in again.";
  }
  if (err instanceof ApiError) {
    if (err.status === 0 || err.error === "NetworkError") {
      return "We couldn't reach the server. Check your connection and try again.";
    }
    if (err.status === 429) {
      return "Too many attempts. Please wait a moment and try again.";
    }
    if (err.status === 401 && (!err.message || err.message === "Unauthorized")) {
      return "Your session has expired. Please sign in again.";
    }
    if (err.code === "EMAIL_NOT_VERIFIED") {
      return "Your email address has not been verified yet. Check your inbox or resend the link.";
    }
    return normalizeRaw(err.message || fallback);
  }
  if (err instanceof Error && err.message) {
    return normalizeRaw(err.message);
  }
  if (typeof err === "string" && err.trim()) {
    return normalizeRaw(err);
  }
  return fallback;
}

export function friendlySuccessMessage(
  message: string | null | undefined,
  fallback: string,
): string {
  if (!message?.trim()) return fallback;
  return normalizeRaw(message) === message ? message.trim() : normalizeRaw(message);
}

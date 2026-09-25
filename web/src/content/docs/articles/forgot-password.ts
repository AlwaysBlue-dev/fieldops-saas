import type { DocArticle } from "../types";

export const forgotPassword: DocArticle = {
  slug: "forgot-password",
  title: "Forgot your password",
  description:
    "Reset your FieldKeel password from the login screen using a secure email link, then sign in again.",
  categoryId: "getting-started",
  keywords: [
    "forgot password",
    "reset password",
    "login",
    "email",
    "account",
    "Mailpit",
  ],
  relatedSlugs: [
    "create-account-workspace",
    "security-privacy",
    "cannot-invite",
  ],
  sections: [
    {
      id: "steps",
      heading: "Reset your password",
      paragraphs: [
        "On the sign-in page, select Forgot password. Enter the work email for your FieldKeel account and choose Send reset link. For privacy, the confirmation message is the same whether or not an account exists for that email.",
        "Open the reset email from FieldKeel and choose Reset password. On the reset page, enter a new password (at least 10 characters) and confirm it. After the password is updated, return to sign in and use the new password. Existing sessions for that account are ended so you must sign in again.",
      ],
    },
    {
      id: "troubleshooting",
      heading: "Troubleshooting",
      paragraphs: [
        "If you do not receive the email, check spam or junk folders and confirm you used the same work email you registered with. Wait a minute and request another link if needed — only the newest unused link remains valid. Local developers: with SMTP pointed at Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`), open the Mailpit UI (typically port 8025) to read the reset message.",
        "If the reset link says it is invalid or has expired, request a new link from Forgot password. Links expire after a short time and can be used only once. After a successful reset, sign in with the new password; the old password will no longer work.",
      ],
    },
  ],
};

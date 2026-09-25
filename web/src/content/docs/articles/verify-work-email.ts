import type { DocArticle } from "../types";

export const verifyWorkEmail: DocArticle = {
  slug: "verify-work-email",
  title: "Verify your work email",
  description:
    "Confirm your work email after creating a FieldKeel account, then create your workspace and start the trial.",
  categoryId: "getting-started",
  keywords: [
    "verify email",
    "verification",
    "signup",
    "Mailpit",
    "resend",
    "account",
  ],
  relatedSlugs: [
    "create-account-workspace",
    "forgot-password",
    "security-privacy",
    "trial-onboarding",
  ],
  sections: [
    {
      id: "steps",
      heading: "How verification works",
      paragraphs: [
        "Create your FieldKeel account with your full name, work email, and password. FieldKeel sends a verification link to that address. Open the message and select Verify email. After your email is confirmed, create your company workspace to start the Professional trial and finish onboarding.",
        "Until verification succeeds, you cannot open a normal workspace. Sign-in with a correct password still works, but you are guided back to the verification screen so you can resend the link if needed.",
      ],
    },
    {
      id: "troubleshooting",
      heading: "Troubleshooting",
      paragraphs: [
        "If you do not receive the email, check spam or junk folders and confirm the address you registered. On the verification screen, use Resend verification email (there is a short cooldown). Local developers: with SMTP pointed at Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`), open the Mailpit UI (typically port 8025) to read the message.",
        "If the link says it is invalid or has expired, request a new one from the verification screen. Links expire after 24 hours and can be used only once. If you registered the wrong email, sign out and create a new account with the correct address (or use Change email / Back to signup from the verification screen).",
      ],
    },
  ],
};

import type { DocArticle } from "../types";

export const membersInvitations: DocArticle = {
  slug: "members-invitations",
  title: "Members and invitations",
  description:
    "Invite people by email with a proposed role, accept invitations, change roles, and soft-deactivate members without destroying history.",
  categoryId: "organizations-members",
  keywords: [
    "invite",
    "members",
    "email",
    "accept",
    "deactivate",
    "seats",
  ],
  relatedSlugs: [
    "roles",
    "cannot-invite",
    "workspace-concept",
    "billing-plans",
    "verify-work-email",
  ],
  sections: [
    {
      id: "invite",
      heading: "Invite by email",
      paragraphs: [
        "Authorized owners and admins invite staff by email with a proposed organization role. Invitations are time-limited offers to join one organization. You can resend or revoke outstanding invitations. Token hashes are stored server-side — plaintext invitation tokens are not returned in ordinary API payloads.",
        "Invite capacity is limited by the plan’s user (seat) entitlement. If you cannot invite, check remaining seats, your role, and whether the workspace is read-only after trial expiry. See troubleshooting for cannot invite.",
      ],
    },
    {
      id: "accept",
      heading: "Accepting an invitation",
      paragraphs: [
        "Invitees accept from the invitation link. The invitation secret proves control of the invited email: new accounts are created already verified for that address, and an existing unverified account for the same email is marked verified on accept. A different signed-in email cannot accept the invite. Existing verified FieldOps users join under their current account. New users set a password as part of acceptance, then land in that organization with the proposed role on their membership.",
        "A person may hold memberships in several organizations. Accepting an invite to company B does not remove membership in company A, and joining by invitation never consumes that person’s personal free-trial eligibility — they may still create their own first trial workspace later.",
      ],
    },
    {
      id: "manage",
      heading: "Roles, deactivation, and last owner",
      paragraphs: [
        "From Members you can change roles for active memberships and soft-deactivate people who leave. Soft-deactivate keeps operational history (jobs they worked, approvals they decided) while blocking further access.",
        "The product prevents the last OWNER from leaving or being deactivated without transferring ownership. Always promote another OWNER before removing the final owner membership.",
      ],
    },
  ],
};

export type MailContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function layout(input: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): MailContent {
  const textParts = [
    input.heading,
    '',
    ...input.paragraphs,
    ...(input.ctaUrl ? ['', input.ctaLabel ? `${input.ctaLabel}:` : 'Open:', input.ctaUrl] : []),
    '',
    input.footerNote ?? 'FieldOps Cloud — field operations for service teams.',
  ];
  const paras = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.55;">${escapeHtml(p)}</p>`)
    .join('');
  const cta =
    input.ctaUrl && input.ctaLabel
      ? `<p style="margin:24px 0 8px;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(input.ctaLabel)}</a></p>
         <p style="margin:0 0 14px;color:#6b7280;font-size:12px;word-break:break-all;">${escapeHtml(input.ctaUrl)}</p>`
      : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Geist,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f172a;padding:18px 24px;">
          <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.02em;">FieldOps Cloud</p>
        </td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <h1 style="margin:0 0 16px;color:#0f172a;font-size:22px;line-height:1.3;">${escapeHtml(input.heading)}</h1>
          ${paras}
          ${cta}
        </td></tr>
        <tr><td style="padding:8px 24px 24px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${escapeHtml(input.footerNote ?? 'FieldOps Cloud — field operations for service teams.')}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return {
    subject: input.heading,
    text: textParts.join('\n'),
    html,
  };
}

export function invitationMail(input: {
  organizationName: string;
  role: string;
  inviteUrl: string;
}): MailContent {
  const roleLabel = input.role.replaceAll('_', ' ').toLowerCase();
  const content = layout({
    preheader: `Join ${input.organizationName} on FieldOps Cloud`,
    heading: `Join ${input.organizationName}`,
    paragraphs: [
      `You have been invited to join ${input.organizationName} on FieldOps Cloud as ${roleLabel}.`,
      'This invitation expires in 7 days and can be used once.',
    ],
    ctaLabel: 'Accept invitation',
    ctaUrl: input.inviteUrl,
  });
  return { ...content, subject: `Join ${input.organizationName} on FieldOps Cloud` };
}

export function jobAssignedMail(input: {
  recipientName: string;
  organizationName: string;
  jobNumber: string;
  jobTitle: string;
  jobUrl: string;
  windowLabel: string | null;
}): MailContent {
  const paragraphs = [
    `Hi ${input.recipientName},`,
    `${input.jobNumber} · ${input.jobTitle} was assigned to you in ${input.organizationName}.`,
  ];
  if (input.windowLabel) {
    paragraphs.push(`Scheduled window: ${input.windowLabel}.`);
  }
  paragraphs.push('Open the job in FieldOps Cloud for site details and instructions.');
  const content = layout({
    preheader: `${input.jobNumber} assigned to you`,
    heading: 'Job assigned',
    paragraphs,
    ctaLabel: 'Open job',
    ctaUrl: input.jobUrl,
  });
  return { ...content, subject: `${input.jobNumber} assigned — ${input.organizationName}` };
}

export function jobReturnedMail(input: {
  recipientName: string;
  organizationName: string;
  jobNumber: string;
  jobTitle: string;
  jobUrl: string;
  reason: string;
}): MailContent {
  const content = layout({
    preheader: `${input.jobNumber} was returned`,
    heading: 'Job returned for updates',
    paragraphs: [
      `Hi ${input.recipientName},`,
      `${input.jobNumber} · ${input.jobTitle} was returned in ${input.organizationName}.`,
      `Reason: ${input.reason}`,
      'Review the feedback and resubmit when ready.',
    ],
    ctaLabel: 'Open job',
    ctaUrl: input.jobUrl,
  });
  return { ...content, subject: `${input.jobNumber} returned — ${input.organizationName}` };
}

export function jobApprovedMail(input: {
  recipientName: string;
  organizationName: string;
  jobNumber: string;
  jobTitle: string;
  jobUrl: string;
}): MailContent {
  const content = layout({
    preheader: `${input.jobNumber} approved`,
    heading: 'Job approved',
    paragraphs: [
      `Hi ${input.recipientName},`,
      `${input.jobNumber} · ${input.jobTitle} was approved and marked complete in ${input.organizationName}.`,
    ],
    ctaLabel: 'View job',
    ctaUrl: input.jobUrl,
  });
  return { ...content, subject: `${input.jobNumber} approved — ${input.organizationName}` };
}

export function overtimeDecisionMail(input: {
  recipientName: string;
  organizationName: string;
  decision: 'APPROVED' | 'REJECTED';
  jobNumber: string | null;
  timeUrl: string;
  comment?: string | null;
}): MailContent {
  const approved = input.decision === 'APPROVED';
  const content = layout({
    preheader: approved ? 'Overtime approved' : 'Overtime rejected',
    heading: approved ? 'Overtime approved' : 'Overtime rejected',
    paragraphs: [
      `Hi ${input.recipientName},`,
      approved
        ? `Your overtime request${input.jobNumber ? ` for ${input.jobNumber}` : ''} was approved in ${input.organizationName}.`
        : `Your overtime request${input.jobNumber ? ` for ${input.jobNumber}` : ''} was rejected in ${input.organizationName}.`,
      ...(input.comment ? [`Note: ${input.comment}`] : []),
    ],
    ctaLabel: 'Open time',
    ctaUrl: input.timeUrl,
  });
  return {
    ...content,
    subject: `${approved ? 'Overtime approved' : 'Overtime rejected'} — ${input.organizationName}`,
  };
}

export function timesheetReturnedMail(input: {
  recipientName: string;
  organizationName: string;
  workDate: string;
  timeUrl: string;
  reason: string;
}): MailContent {
  const content = layout({
    preheader: 'Timesheet returned',
    heading: 'Timesheet returned',
    paragraphs: [
      `Hi ${input.recipientName},`,
      `Your timesheet for ${input.workDate} was returned in ${input.organizationName}.`,
      `Reason: ${input.reason}`,
      'Update the entry and submit again when ready.',
    ],
    ctaLabel: 'Open time',
    ctaUrl: input.timeUrl,
  });
  return { ...content, subject: `Timesheet returned — ${input.organizationName}` };
}

export function trialEndingMail(input: {
  organizationName: string;
  daysRemaining: number;
  billingUrl: string;
}): MailContent {
  const content = layout({
    preheader: 'Trial ending soon',
    heading: 'Your trial is ending soon',
    paragraphs: [
      `The FieldOps Cloud trial for ${input.organizationName} ends in ${input.daysRemaining} day${input.daysRemaining === 1 ? '' : 's'}.`,
      'Request activation from Plan & Subscription or Billing. When your invoice is ready, complete payment there — no credit card is required in the product.',
    ],
    ctaLabel: 'Open plan & subscription',
    ctaUrl: input.billingUrl,
  });
  return { ...content, subject: 'Your FieldOps Cloud trial is ending soon' };
}

export function trialGraceMail(input: {
  organizationName: string;
  graceDaysRemaining: number;
  billingUrl: string;
}): MailContent {
  const content = layout({
    preheader: 'Trial grace period',
    heading: 'Your trial grace period is active',
    paragraphs: [
      `The trial for ${input.organizationName} has ended. You are in a ${input.graceDaysRemaining}-day grace window.`,
      'Request activation or complete payment from Billing to keep full write access.',
    ],
    ctaLabel: 'Request activation',
    ctaUrl: input.billingUrl,
  });
  return { ...content, subject: 'Your FieldOps Cloud trial grace period is active' };
}

export function trialExpiredMail(input: {
  organizationName: string;
  billingUrl: string;
}): MailContent {
  const content = layout({
    preheader: 'Trial expired',
    heading: 'Your trial has ended',
    paragraphs: [
      `The FieldOps Cloud trial for ${input.organizationName} has ended. The workspace is read-only.`,
      'Existing records are kept. Open Billing to request activation or complete payment and restore writes.',
    ],
    ctaLabel: 'Open Billing',
    ctaUrl: input.billingUrl,
  });
  return { ...content, subject: 'Your FieldOps Cloud trial has ended' };
}

export function activationAckMail(input: {
  recipientName: string;
  organizationName: string;
  billingUrl: string;
}): MailContent {
  const content = layout({
    preheader: 'Activation request received',
    heading: 'We received your activation request',
    paragraphs: [
      `Hi ${input.recipientName},`,
      `FieldOps received an activation request for ${input.organizationName}.`,
      'Your invoice is being prepared. Track status under Plan & Subscription and Billing.',
    ],
    ctaLabel: 'Open plan & subscription',
    ctaUrl: input.billingUrl,
  });
  return { ...content, subject: `Activation request received — ${input.organizationName}` };
}

export function emailVerificationMail(input: {
  verifyUrl: string;
  email: string;
}): MailContent {
  const content = layout({
    preheader: 'Verify your FieldOps Cloud email',
    heading: 'Verify your FieldOps Cloud email',
    paragraphs: [
      `Confirm that ${input.email} belongs to you to finish setting up your FieldOps Cloud account.`,
      'This link expires in 24 hours and can only be used once.',
      'If you did not create a FieldOps Cloud account, you can ignore this email.',
    ],
    ctaLabel: 'Verify email',
    ctaUrl: input.verifyUrl,
  });
  return { ...content, subject: 'Verify your FieldOps Cloud email' };
}

export function passwordResetMail(input: {
  resetUrl: string;
  expiresInMinutes: number;
}): MailContent {
  const content = layout({
    preheader: 'Reset your FieldOps Cloud password',
    heading: 'Reset your FieldOps Cloud password',
    paragraphs: [
      'We received a request to reset the password for your FieldOps Cloud account.',
      `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      'If you did not request a password reset, you can ignore this email. Your password will stay the same.',
    ],
    ctaLabel: 'Reset password',
    ctaUrl: input.resetUrl,
    footerNote:
      'FieldOps Cloud — field operations for service teams. Never share this link with anyone.',
  });
  return { ...content, subject: 'Reset your FieldOps Cloud password' };
}


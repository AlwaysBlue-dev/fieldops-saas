import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  ApprovalStatus,
  ApprovalType,
  JobFileType,
  JobStatus,
  TimeEntryType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

@Injectable()
export class JobReportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async render(
    ctx: OrganizationContext,
    jobId: string,
    actorUserId: string,
    canView: boolean,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!canView) {
      throw new NotFoundException();
    }
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId: ctx.organizationId },
      include: {
        organization: { select: { name: true, logoUrl: true } },
        client: { select: { name: true, accountCode: true } },
        site: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            region: true,
            postalCode: true,
            country: true,
          },
        },
        team: { select: { name: true } },
        supervisor: { select: { fullName: true } },
        assignments: {
          include: { user: { select: { fullName: true } } },
          orderBy: { assignedAt: 'asc' },
        },
        safetyControls: { orderBy: { code: 'asc' } },
        materials: { orderBy: { createdAt: 'asc' } },
        files: {
          where: { type: { in: [JobFileType.PHOTO, JobFileType.SIGNATURE] } },
          orderBy: { createdAt: 'asc' },
          take: 20,
        },
        signatures: { orderBy: { signedAt: 'desc' }, take: 1 },
        timeEntries: {
          where: { endedAt: { not: null } },
          select: {
            type: true,
            durationMinutes: true,
            workDate: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException();
    }

    const approvals = await this.prisma.approval.findMany({
      where: {
        organizationId: ctx.organizationId,
        type: ApprovalType.JOB_COMPLETION,
        subjectId: job.id,
        status: { not: ApprovalStatus.PENDING },
      },
      include: {
        decidedBy: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
      },
      orderBy: { decidedAt: 'desc' },
      take: 10,
    });

    let signatureBytes: Buffer | null = null;
    const signature = job.signatures[0];
    if (signature) {
      const object = await this.storage.get(signature.objectKey);
      if (object?.body?.length) {
        signatureBytes = object.body;
      }
    }

    const labourMinutes = job.timeEntries.reduce(
      (sum, row) => sum + (row.durationMinutes ?? 0),
      0,
    );
    const generatedAt = new Date();
    const buffer = await this.buildPdf({
      orgName: job.organization.name,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      clientName: job.client.name,
      siteName: job.site.name,
      address: formatAddress(job.site),
      workOrder: job.workOrderNumber,
      scope: job.scope,
      scheduledStart: job.scheduledStart,
      expectedFinish: job.expectedFinish,
      completedAt: job.completedAt,
      teamName: job.team?.name ?? null,
      supervisorName: job.supervisor?.fullName ?? null,
      technicians: job.assignments.map((row) => row.user.fullName),
      safety: job.safetyControls.map((row) => ({
        code: row.code,
        title: row.title,
        required: row.isRequired,
        completed: Boolean(row.completedAt),
      })),
      workPerformed: job.workPerformed,
      materials: job.materials.map((row) => ({
        name: row.name,
        quantity: row.quantity.toString(),
        unit: row.unit,
      })),
      clientRep: job.clientRepName,
      clientRepTitle: job.clientRepTitle,
      clientAccepted: job.clientAccepted,
      clientComments: job.clientComments,
      signedAt: job.signedAt ?? signature?.signedAt ?? null,
      signerName: signature?.signerName ?? job.clientRepName,
      signatureBytes,
      photoCount: job.files.filter((row) => row.type === JobFileType.PHOTO).length,
      labourMinutes,
      labourRows: job.timeEntries.map((row) => ({
        name: row.user.fullName,
        type: row.type,
        minutes: row.durationMinutes ?? 0,
        workDate: row.workDate.toISOString().slice(0, 10),
      })),
      outcome: job.outcome,
      outcomeReason: job.outcomeReason,
      approvals: approvals.map((row) => ({
        status: row.status,
        decidedBy: row.decidedBy?.fullName ?? null,
        decidedAt: row.decidedAt,
        comment: row.comment,
      })),
      timezone: ctx.timezone,
      generatedAt,
      generatedByUserId: actorUserId,
    });

    return {
      buffer,
      filename: `${job.jobNumber}-job-report.pdf`,
    };
  }

  private buildPdf(input: PdfModel): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 42 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ink = '#0f172a';
      const muted = '#64748b';
      const rule = '#e2e8f0';

      doc.fillColor(ink).fontSize(18).text(input.orgName);
      doc.fillColor(muted).fontSize(9).text('Digital Job Report');
      doc.moveDown(0.4);
      doc
        .strokeColor(rule)
        .lineWidth(1)
        .moveTo(42, doc.y)
        .lineTo(553, doc.y)
        .stroke();
      doc.moveDown(0.8);

      doc.fillColor(ink).fontSize(14).text(`${input.jobNumber} · ${input.title}`);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Status: ${input.status.replaceAll('_', ' ')}`);
      doc.text(`Client: ${input.clientName}`);
      doc.text(`Site: ${input.siteName}`);
      if (input.address) doc.text(`Address: ${input.address}`);
      if (input.workOrder) doc.text(`Work order: ${input.workOrder}`);
      doc.moveDown(0.6);

      section(doc, 'Schedule', ink);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Scheduled: ${fmt(input.scheduledStart, input.timezone)} – ${fmt(input.expectedFinish, input.timezone)}`);
      doc.text(`Completed: ${fmt(input.completedAt, input.timezone)}`);
      doc.text(
        `Crew: ${input.technicians.length ? input.technicians.join(', ') : '—'}`,
      );
      doc.text(`Team: ${input.teamName ?? '—'}`);
      doc.text(`Supervisor: ${input.supervisorName ?? '—'}`);
      doc.moveDown(0.5);

      if (input.scope) {
        section(doc, 'Scope', ink);
        doc.fillColor(muted).fontSize(10).text(input.scope, { width: 510 });
        doc.moveDown(0.5);
      }

      section(doc, 'Safety', ink);
      doc.fillColor(muted).fontSize(10);
      if (input.safety.length === 0) {
        doc.text('No safety controls recorded.');
      } else {
        for (const row of input.safety) {
          const mark = row.completed ? 'Done' : row.required ? 'Open' : 'Optional';
          doc.text(`${row.code} · ${row.title} — ${mark}`);
        }
      }
      doc.moveDown(0.5);

      section(doc, 'Work performed', ink);
      doc
        .fillColor(muted)
        .fontSize(10)
        .text(input.workPerformed?.trim() || '—', { width: 510 });
      doc.moveDown(0.5);

      section(doc, 'Materials', ink);
      doc.fillColor(muted).fontSize(10);
      if (input.materials.length === 0) {
        doc.text('None recorded.');
      } else {
        for (const row of input.materials) {
          doc.text(`${row.name} — ${row.quantity} ${row.unit}`);
        }
      }
      doc.moveDown(0.5);

      section(doc, 'Client sign-off', ink);
      doc.fillColor(muted).fontSize(10);
      doc.text(
        `Representative: ${input.clientRep ?? '—'}${input.clientRepTitle ? ` (${input.clientRepTitle})` : ''}`,
      );
      doc.text(`Accepted: ${input.clientAccepted ? 'Yes' : 'No'}`);
      doc.text(`Signed at: ${fmt(input.signedAt, input.timezone)}`);
      if (input.clientComments) {
        doc.text(`Comments: ${input.clientComments}`, { width: 510 });
      }
      if (input.signatureBytes) {
        try {
          doc.moveDown(0.3);
          doc.image(input.signatureBytes, {
            fit: [220, 80],
          });
          doc.moveDown(0.3);
        } catch {
          doc.text('Signature image unavailable.');
        }
      } else if (input.signerName) {
        doc.text(`Signer: ${input.signerName}`);
      }
      doc.moveDown(0.5);

      section(doc, 'Evidence & labour', ink);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Photos on file: ${input.photoCount}`);
      doc.text(`Total labour: ${formatMinutes(input.labourMinutes)}`);
      for (const row of input.labourRows.slice(0, 12)) {
        doc.text(
          `${row.workDate} · ${row.name} · ${row.type} · ${formatMinutes(row.minutes)}`,
        );
      }
      doc.moveDown(0.5);

      section(doc, 'Outcome & approvals', ink);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Outcome: ${input.outcome?.replaceAll('_', ' ') ?? '—'}`);
      if (input.outcomeReason) doc.text(`Reason: ${input.outcomeReason}`);
      if (input.approvals.length === 0) {
        doc.text('No approval decisions recorded.');
      } else {
        for (const row of input.approvals) {
          doc.text(
            `${row.status} · ${row.decidedBy ?? '—'} · ${fmt(row.decidedAt, input.timezone)}${row.comment ? ` · ${row.comment}` : ''}`,
          );
        }
      }

      doc.moveDown(1);
      doc
        .fillColor(muted)
        .fontSize(8)
        .text(
          `Generated ${fmt(input.generatedAt, input.timezone)} · ${input.orgName} · FieldOps Cloud`,
          { width: 510 },
        );

      doc.end();
    });
  }
}

type PdfModel = {
  orgName: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  clientName: string;
  siteName: string;
  address: string | null;
  workOrder: string | null;
  scope: string | null;
  scheduledStart: Date | null;
  expectedFinish: Date | null;
  completedAt: Date | null;
  teamName: string | null;
  supervisorName: string | null;
  technicians: string[];
  safety: Array<{
    code: string;
    title: string;
    required: boolean;
    completed: boolean;
  }>;
  workPerformed: string | null;
  materials: Array<{ name: string; quantity: string; unit: string }>;
  clientRep: string | null;
  clientRepTitle: string | null;
  clientAccepted: boolean;
  clientComments: string | null;
  signedAt: Date | null;
  signerName: string | null | undefined;
  signatureBytes: Buffer | null;
  photoCount: number;
  labourMinutes: number;
  labourRows: Array<{
    name: string;
    type: TimeEntryType;
    minutes: number;
    workDate: string;
  }>;
  outcome: string | null;
  outcomeReason: string | null;
  approvals: Array<{
    status: ApprovalStatus;
    decidedBy: string | null;
    decidedAt: Date | null;
    comment: string | null;
  }>;
  timezone: string;
  generatedAt: Date;
  generatedByUserId: string;
};

function section(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  ink: string,
) {
  doc.fillColor(ink).fontSize(11).text(title);
  doc.moveDown(0.2);
}

function formatAddress(site: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}) {
  return [
    site.addressLine1,
    site.addressLine2,
    [site.city, site.region, site.postalCode].filter(Boolean).join(', '),
    site.country,
  ]
    .filter(Boolean)
    .join(' · ') || null;
}

function fmt(value: Date | null | undefined, timeZone: string) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

import type {
  Client,
  Job,
  Site,
  SiteContact,
} from '../generated/prisma/client.js';

function coord(value: { toString(): string } | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export function serializeClient(
  client: Client,
  extras: {
    siteCount?: number;
    jobCount?: number;
    lastActivityAt?: Date | null;
    lastJob?: { jobNumber: string; title: string; status: string } | null;
  } = {},
) {
  return {
    id: client.id,
    organizationId: client.organizationId,
    name: client.name,
    clientCode: client.accountCode,
    status: client.status,
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail ?? client.email,
    primaryContactPhone: client.primaryContactPhone ?? client.phone,
    billingEmail: client.billingEmail,
    website: client.website,
    notes: client.notes,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    siteCount: extras.siteCount ?? 0,
    jobCount: extras.jobCount ?? 0,
    lastActivityAt: extras.lastActivityAt?.toISOString() ?? null,
    lastJob: extras.lastJob ?? null,
  };
}

export function serializeSite(
  site: Site,
  extras: { contactCount?: number; contacts?: SiteContact[] } = {},
) {
  return {
    id: site.id,
    organizationId: site.organizationId,
    clientId: site.clientId,
    name: site.name,
    siteCode: site.siteCode,
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    stateRegion: site.region,
    postalCode: site.postalCode,
    country: site.country,
    latitude: coord(site.latitude),
    longitude: coord(site.longitude),
    timezone: site.timezone,
    siteContactName: site.siteContactName,
    siteContactEmail: site.siteContactEmail,
    siteContactPhone: site.siteContactPhone,
    notes: site.notes ?? site.accessNotes,
    status: site.status,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    contactCount: extras.contactCount ?? extras.contacts?.length ?? 0,
    contacts: extras.contacts?.map(serializeSiteContact),
  };
}

export function serializeSiteContact(contact: SiteContact) {
  return {
    id: contact.id,
    organizationId: contact.organizationId,
    siteId: contact.siteId,
    name: contact.name,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    isPrimary: contact.isPrimary,
    notes: contact.notes,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export function serializeJobSummary(job: Pick<Job, 'id' | 'jobNumber' | 'title' | 'status' | 'scheduledStart' | 'updatedAt'>) {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    status: job.status,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

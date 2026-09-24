import { apiRequest } from "./api";

export type ClientStatus = "ACTIVE" | "INACTIVE";

export type ClientSummary = {
  id: string;
  organizationId: string;
  name: string;
  clientCode: string | null;
  status: ClientStatus;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  billingEmail: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  siteCount: number;
  jobCount: number;
  lastActivityAt: string | null;
  lastJob: { jobNumber: string; title: string; status: string } | null;
};

export type SiteContact = {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export type SiteRecord = {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  siteCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  siteContactName: string | null;
  siteContactEmail: string | null;
  siteContactPhone: string | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  contactCount: number;
  contacts?: SiteContact[];
  client?: { id: string; name: string };
};

export type ClientJob = {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  updatedAt: string;
};

export type ClientActivity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

export type ClientDetail = ClientSummary & {
  sites: SiteRecord[];
  jobs: ClientJob[];
  activity: ClientActivity[];
};

export type ClientListResponse = {
  items: ClientSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type ClientWriteBody = {
  name: string;
  clientCode?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  billingEmail?: string;
  website?: string;
  notes?: string;
};

export type SiteWriteBody = {
  name: string;
  siteCode?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateRegion?: string;
  postalCode?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  siteContactName?: string;
  siteContactEmail?: string;
  siteContactPhone?: string;
  notes?: string;
};

export function listClients(
  organizationId: string,
  query: {
    search?: string;
    status?: ClientStatus | "";
    page?: number;
    pageSize?: number;
    sort?: string;
    order?: "asc" | "desc";
  } = {},
) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<ClientListResponse>(
    `/organizations/${organizationId}/clients${suffix}`,
  );
}

export function listClientSites(
  organizationId: string,
  clientId: string,
  query: {
    status?: ClientStatus | "";
    page?: number;
    pageSize?: number;
    search?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<{
    items: SiteRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/organizations/${organizationId}/clients/${clientId}/sites${suffix}`);
}

export function getClient(organizationId: string, clientId: string) {
  return apiRequest<ClientDetail>(
    `/organizations/${organizationId}/clients/${clientId}`,
  );
}

export function createClient(organizationId: string, body: ClientWriteBody) {
  return apiRequest<ClientSummary>(`/organizations/${organizationId}/clients`, {
    method: "POST",
    body,
  });
}

export function updateClient(
  organizationId: string,
  clientId: string,
  body: Partial<ClientWriteBody> & { status?: ClientStatus },
) {
  return apiRequest<ClientSummary>(
    `/organizations/${organizationId}/clients/${clientId}`,
    { method: "PATCH", body },
  );
}

export function deactivateClient(organizationId: string, clientId: string) {
  return apiRequest<ClientSummary>(
    `/organizations/${organizationId}/clients/${clientId}/deactivate`,
    { method: "POST" },
  );
}

export function createSite(
  organizationId: string,
  clientId: string,
  body: SiteWriteBody,
) {
  return apiRequest<SiteRecord>(
    `/organizations/${organizationId}/clients/${clientId}/sites`,
    { method: "POST", body },
  );
}

export function updateSite(
  organizationId: string,
  siteId: string,
  body: Partial<SiteWriteBody> & { status?: ClientStatus },
) {
  return apiRequest<SiteRecord>(
    `/organizations/${organizationId}/sites/${siteId}`,
    { method: "PATCH", body },
  );
}

export function deactivateSite(organizationId: string, siteId: string) {
  return apiRequest<SiteRecord>(
    `/organizations/${organizationId}/sites/${siteId}/deactivate`,
    { method: "POST" },
  );
}

export function createSiteContact(
  organizationId: string,
  siteId: string,
  body: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    isPrimary?: boolean;
    notes?: string;
  },
) {
  return apiRequest<SiteContact>(
    `/organizations/${organizationId}/sites/${siteId}/contacts`,
    { method: "POST", body },
  );
}

export function formatSiteAddress(site: Pick<
  SiteRecord,
  "addressLine1" | "addressLine2" | "city" | "stateRegion" | "postalCode" | "country"
>) {
  return [
    site.addressLine1,
    site.addressLine2,
    [site.city, site.stateRegion, site.postalCode].filter(Boolean).join(", "),
    site.country,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function mapsUrl(site: Pick<
  SiteRecord,
  "latitude" | "longitude" | "addressLine1" | "city" | "stateRegion" | "postalCode" | "country"
>) {
  if (site.latitude != null && site.longitude != null) {
    return `https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=16/${site.latitude}/${site.longitude}`;
  }
  const query = [
    site.addressLine1,
    site.city,
    site.stateRegion,
    site.postalCode,
    site.country,
  ]
    .filter(Boolean)
    .join(", ");
  if (!query) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

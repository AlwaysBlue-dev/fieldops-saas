import { config } from 'dotenv';
import { hash } from 'bcrypt';
import {
  ClockSessionStatus,
  BillingInterval,
  InvitationStatus,
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  PlanStatus,
  PlatformRole,
  PrismaClient,
  SubscriptionStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { createPrismaClient } from '../src/prisma/create-prisma-client.js';

config();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';
const BCRYPT_ROUNDS = 10;

type OrgSeedInput = {
  name: string;
  slug: string;
  email: string;
  phone: string;
  timezone: string;
  planCode: string;
  industry: string;
  jobPrefix: string;
  users: Array<{
    email: string;
    fullName: string;
    phone: string;
    role: OrganizationRole;
  }>;
  teams: Array<{
    name: string;
    code?: string;
    description?: string;
    supervisorEmail?: string;
    memberEmails: string[];
  }>;
  skills: Array<{ name: string; emails: string[] }>;
  certifications: Array<{
    email: string;
    name: string;
    certificateNumber?: string;
    issuedAt?: Date;
    expiresAt?: Date | null;
  }>;
  clients: Array<{
    name: string;
    accountCode: string;
    email: string;
    phone: string;
    sites: Array<{
      name: string;
      city: string;
      region: string;
      postalCode: string;
      country: string;
      latitude: string;
      longitude: string;
      contactName: string;
      contactTitle: string;
      contactPhone: string;
      contactEmail: string;
    }>;
  }>;
  jobs: Array<{
    jobNumber: string;
    title: string;
    clientAccountCode: string;
    siteName: string;
    jobType: string;
    priority: JobPriority;
    teamName: string;
    supervisorEmail: string;
    technicianEmails: string[];
    status: JobStatus;
    scope: string;
    clientRepName: string;
  }>;
};

const GB = 1024n * 1024n * 1024n;

const organizations: OrgSeedInput[] = [
  {
    name: 'Northstar Electrical',
    slug: 'northstar-electrical',
    email: 'ops@northstar.fieldops.local',
    phone: '+1-312-555-0140',
    industry: 'Electrical',
    timezone: 'America/Chicago',
    planCode: 'business',
    jobPrefix: 'NS-',
    users: [
      {
        email: 'jordan.hale@northstar.fieldops.local',
        fullName: 'Jordan Hale',
        phone: '+1-312-555-0101',
        role: OrganizationRole.OWNER,
      },
      {
        email: 'avery.quinn@northstar.fieldops.local',
        fullName: 'Avery Quinn',
        phone: '+1-312-555-0102',
        role: OrganizationRole.ADMIN,
      },
      {
        email: 'morgan.ellis@northstar.fieldops.local',
        fullName: 'Morgan Ellis',
        phone: '+1-312-555-0103',
        role: OrganizationRole.OPERATIONS_MANAGER,
      },
      {
        email: 'riley.chen@northstar.fieldops.local',
        fullName: 'Riley Chen',
        phone: '+1-312-555-0104',
        role: OrganizationRole.SUPERVISOR,
      },
      {
        email: 'sam.ortega@northstar.fieldops.local',
        fullName: 'Sam Ortega',
        phone: '+1-312-555-0105',
        role: OrganizationRole.TECHNICIAN,
      },
      {
        email: 'casey.nguyen@northstar.fieldops.local',
        fullName: 'Casey Nguyen',
        phone: '+1-312-555-0106',
        role: OrganizationRole.TECHNICIAN,
      },
    ],
    teams: [
      {
        name: 'Chicago Service',
        code: 'CHI-1',
        description: 'North-side electrical response crew.',
        supervisorEmail: 'riley.chen@northstar.fieldops.local',
        memberEmails: [
          'riley.chen@northstar.fieldops.local',
          'sam.ortega@northstar.fieldops.local',
          'casey.nguyen@northstar.fieldops.local',
        ],
      },
    ],
    skills: [
      {
        name: 'Electrical',
        emails: [
          'riley.chen@northstar.fieldops.local',
          'sam.ortega@northstar.fieldops.local',
          'casey.nguyen@northstar.fieldops.local',
        ],
      },
      { name: 'Fire Alarm', emails: ['casey.nguyen@northstar.fieldops.local'] },
      { name: 'Generator', emails: ['sam.ortega@northstar.fieldops.local'] },
      {
        name: 'Inspection',
        emails: [
          'riley.chen@northstar.fieldops.local',
          'casey.nguyen@northstar.fieldops.local',
        ],
      },
    ],
    certifications: [
      {
        email: 'sam.ortega@northstar.fieldops.local',
        name: 'Illinois Electrical License',
        certificateNumber: 'EL-44120',
        issuedAt: new Date('2024-03-01T00:00:00.000Z'),
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      },
      {
        email: 'casey.nguyen@northstar.fieldops.local',
        name: 'Fire Alarm NICET II',
        certificateNumber: 'FA-2291',
        issuedAt: new Date('2023-11-15T00:00:00.000Z'),
        expiresAt: new Date(Date.now() + 20 * 86_400_000),
      },
    ],
    clients: [
      {
        name: 'Harborview Clinic',
        accountCode: 'HVC-100',
        email: 'facilities@harborview.example',
        phone: '+1-312-555-2201',
        sites: [
          {
            name: 'Harborview Main Campus',
            city: 'Chicago',
            region: 'IL',
            postalCode: '60611',
            country: 'US',
            latitude: '41.8930000',
            longitude: '-87.6230000',
            contactName: 'Priya Shah',
            contactTitle: 'Facilities Lead',
            contactPhone: '+1-312-555-2210',
            contactEmail: 'priya.shah@harborview.example',
          },
        ],
      },
      {
        name: 'Maple Street Bakery',
        accountCode: 'MSB-240',
        email: 'owner@maplestreet.example',
        phone: '+1-312-555-3301',
        sites: [
          {
            name: 'Storefront Kitchen',
            city: 'Evanston',
            region: 'IL',
            postalCode: '60201',
            country: 'US',
            latitude: '42.0480000',
            longitude: '-87.6820000',
            contactName: 'Elena Rossi',
            contactTitle: 'Owner',
            contactPhone: '+1-312-555-3302',
            contactEmail: 'elena@maplestreet.example',
          },
        ],
      },
    ],
    jobs: [
      {
        jobNumber: 'NS-1001',
        title: 'Exam-room panel upgrade',
        clientAccountCode: 'HVC-100',
        siteName: 'Harborview Main Campus',
        jobType: 'INSTALL',
        priority: JobPriority.HIGH,
        teamName: 'Chicago Service',
        supervisorEmail: 'riley.chen@northstar.fieldops.local',
        technicianEmails: ['sam.ortega@northstar.fieldops.local'],
        status: JobStatus.IN_PROGRESS,
        scope: 'Replace aging panel and label new circuits in exam wing B.',
        clientRepName: 'Priya Shah',
      },
      {
        jobNumber: 'NS-1002',
        title: 'Kitchen circuit for new ovens',
        clientAccountCode: 'MSB-240',
        siteName: 'Storefront Kitchen',
        jobType: 'SERVICE_CALL',
        priority: JobPriority.NORMAL,
        teamName: 'Chicago Service',
        supervisorEmail: 'riley.chen@northstar.fieldops.local',
        technicianEmails: ['casey.nguyen@northstar.fieldops.local'],
        status: JobStatus.SCHEDULED,
        scope: 'Add dedicated 50A circuit and verify grounding.',
        clientRepName: 'Elena Rossi',
      },
    ],
  },
  {
    name: 'BluePeak HVAC',
    slug: 'bluepeak-hvac',
    email: 'dispatch@bluepeak.fieldops.local',
    phone: '+1-303-555-0188',
    industry: 'HVAC',
    timezone: 'America/Denver',
    planCode: 'starter',
    jobPrefix: 'BP-',
    users: [
      {
        email: 'dana.brooks@bluepeak.fieldops.local',
        fullName: 'Dana Brooks',
        phone: '+1-303-555-0201',
        role: OrganizationRole.OWNER,
      },
      {
        email: 'lee.park@bluepeak.fieldops.local',
        fullName: 'Lee Park',
        phone: '+1-303-555-0202',
        role: OrganizationRole.ADMIN,
      },
      {
        email: 'chris.vadim@bluepeak.fieldops.local',
        fullName: 'Chris Vadim',
        phone: '+1-303-555-0203',
        role: OrganizationRole.OPERATIONS_MANAGER,
      },
      {
        email: 'nina.solis@bluepeak.fieldops.local',
        fullName: 'Nina Solis',
        phone: '+1-303-555-0204',
        role: OrganizationRole.SUPERVISOR,
      },
      {
        email: 'owen.drake@bluepeak.fieldops.local',
        fullName: 'Owen Drake',
        phone: '+1-303-555-0205',
        role: OrganizationRole.TECHNICIAN,
      },
      {
        email: 'ivy.march@bluepeak.fieldops.local',
        fullName: 'Ivy March',
        phone: '+1-303-555-0206',
        role: OrganizationRole.TECHNICIAN,
      },
    ],
    teams: [
      {
        name: 'Front Range Crew',
        code: 'FR-1',
        description: 'Denver metro HVAC and plant crew.',
        supervisorEmail: 'nina.solis@bluepeak.fieldops.local',
        memberEmails: [
          'nina.solis@bluepeak.fieldops.local',
          'owen.drake@bluepeak.fieldops.local',
          'ivy.march@bluepeak.fieldops.local',
        ],
      },
    ],
    skills: [
      {
        name: 'HVAC',
        emails: [
          'nina.solis@bluepeak.fieldops.local',
          'owen.drake@bluepeak.fieldops.local',
          'ivy.march@bluepeak.fieldops.local',
        ],
      },
      { name: 'Plumbing', emails: ['ivy.march@bluepeak.fieldops.local'] },
      { name: 'Generator', emails: ['owen.drake@bluepeak.fieldops.local'] },
      {
        name: 'Inspection',
        emails: ['nina.solis@bluepeak.fieldops.local'],
      },
    ],
    certifications: [
      {
        email: 'owen.drake@bluepeak.fieldops.local',
        name: 'HVAC Journeyman',
        certificateNumber: 'HV-8801',
        issuedAt: new Date('2022-06-01T00:00:00.000Z'),
      },
      {
        email: 'ivy.march@bluepeak.fieldops.local',
        name: 'EPA 608',
        certificateNumber: '608-1144',
        issuedAt: new Date('2021-01-10T00:00:00.000Z'),
        expiresAt: new Date(Date.now() - 10 * 86_400_000),
      },
    ],
    clients: [
      {
        name: 'Summit Lodge',
        accountCode: 'SML-010',
        email: 'engineering@summitlodge.example',
        phone: '+1-970-555-4401',
        sites: [
          {
            name: 'Main Lodge Rooftop',
            city: 'Breckenridge',
            region: 'CO',
            postalCode: '80424',
            country: 'US',
            latitude: '39.4817000',
            longitude: '-106.0384000',
            contactName: 'Hugh Benton',
            contactTitle: 'Chief Engineer',
            contactPhone: '+1-970-555-4410',
            contactEmail: 'hugh.benton@summitlodge.example',
          },
        ],
      },
      {
        name: 'Pine Ridge School District',
        accountCode: 'PRS-088',
        email: 'maintenance@pineridge.example',
        phone: '+1-303-555-5501',
        sites: [
          {
            name: 'West Campus Mechanical Room',
            city: 'Lakewood',
            region: 'CO',
            postalCode: '80226',
            country: 'US',
            latitude: '39.7047000',
            longitude: '-105.0814000',
            contactName: 'Tara Nguyen',
            contactTitle: 'Maintenance Supervisor',
            contactPhone: '+1-303-555-5511',
            contactEmail: 'tara.nguyen@pineridge.example',
          },
        ],
      },
    ],
    jobs: [
      {
        jobNumber: 'BP-1001',
        title: 'Rooftop unit seasonal service',
        clientAccountCode: 'SML-010',
        siteName: 'Main Lodge Rooftop',
        jobType: 'MAINTENANCE',
        priority: JobPriority.NORMAL,
        teamName: 'Front Range Crew',
        supervisorEmail: 'nina.solis@bluepeak.fieldops.local',
        technicianEmails: ['owen.drake@bluepeak.fieldops.local'],
        status: JobStatus.SCHEDULED,
        scope: 'Filter change, belt inspection, and refrigerant check on RTU-3.',
        clientRepName: 'Hugh Benton',
      },
      {
        jobNumber: 'BP-1002',
        title: 'Chiller inspection before occupancy',
        clientAccountCode: 'PRS-088',
        siteName: 'West Campus Mechanical Room',
        jobType: 'INSPECTION',
        priority: JobPriority.URGENT,
        teamName: 'Front Range Crew',
        supervisorEmail: 'nina.solis@bluepeak.fieldops.local',
        technicianEmails: ['ivy.march@bluepeak.fieldops.local'],
        status: JobStatus.DISPATCHED,
        scope: 'Inspect chiller 2, log temperatures, and report leaks.',
        clientRepName: 'Tara Nguyen',
      },
    ],
  },
];

async function seedPlans(prisma: PrismaClient) {
  const plans = [
    {
      code: 'starter',
      name: 'Starter',
      monthlyPriceCents: 4900,
      annualPriceCents: 49000,
      displayPrice: null,
      currency: 'USD',
      billingInterval: BillingInterval.ANNUAL,
      publiclyVisible: false,
      contactSales: false,
      sortOrder: 90,
      maxUsers: 8,
      maxStorageBytes: 5n * GB,
      features: {
        JOBS: true,
        TIMESHEETS: true,
        GPS: true,
        CLIENT_SIGNATURE: true,
        ADVANCED_REPORTS: false,
        CUSTOM_BRANDING: false,
        gps: true,
        approvals: false,
        reports: 'basic',
      },
    },
    {
      code: 'professional',
      name: 'Professional',
      monthlyPriceCents: null,
      annualPriceCents: 49900,
      displayPrice: null,
      currency: 'USD',
      billingInterval: BillingInterval.ANNUAL,
      publiclyVisible: true,
      contactSales: false,
      sortOrder: 10,
      maxUsers: 10,
      maxStorageBytes: 20n * GB,
      features: {
        JOBS: true,
        TIMESHEETS: true,
        GPS: true,
        CLIENT_SIGNATURE: true,
        ADVANCED_REPORTS: true,
        CUSTOM_BRANDING: false,
        gps: true,
        approvals: true,
        reports: 'standard',
        support: 'standard',
        productUpdates: true,
        publicHighlights: [
          'Scheduling & Dispatch',
          'Job Management',
          'Technician Mobile Experience',
          'Clock In/Out & GPS Evidence',
          'Safety & Job Execution',
          'Materials & Work Logs',
          'Standard Support',
          'Product Updates',
        ],
      },
    },
    {
      code: 'business',
      name: 'Business',
      monthlyPriceCents: null,
      annualPriceCents: null,
      displayPrice: null,
      currency: 'USD',
      billingInterval: BillingInterval.CUSTOM,
      publiclyVisible: true,
      contactSales: true,
      sortOrder: 20,
      maxUsers: 100,
      maxStorageBytes: 250n * GB,
      features: {
        JOBS: true,
        TIMESHEETS: true,
        GPS: true,
        CLIENT_SIGNATURE: true,
        ADVANCED_REPORTS: true,
        CUSTOM_BRANDING: true,
        gps: true,
        approvals: true,
        reports: 'standard',
        support: 'standard',
        productUpdates: true,
      },
    },
  ];

  const byCode: Record<string, { id: string }> = {};

  for (const plan of plans) {
    const row = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        status: PlanStatus.ACTIVE,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualPriceCents: plan.annualPriceCents,
        displayPrice: plan.displayPrice,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        publiclyVisible: plan.publiclyVisible,
        contactSales: plan.contactSales,
        sortOrder: plan.sortOrder,
        maxUsers: plan.maxUsers,
        maxStorageBytes: plan.maxStorageBytes,
        features: plan.features,
      },
      create: {
        ...plan,
        status: PlanStatus.ACTIVE,
      },
    });
    byCode[plan.code] = row;
  }

  return byCode;
}

async function seedOrganization(
  prisma: PrismaClient,
  passwordHash: string,
  planId: string,
  input: OrgSeedInput,
) {
  const organization = await prisma.organization.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      industry: input.industry,
      timezone: input.timezone,
      onboardingStep: 5,
      onboardingCompletedAt: new Date(),
    },
    create: {
      name: input.name,
      slug: input.slug,
      email: input.email,
      phone: input.phone,
      industry: input.industry,
      timezone: input.timezone,
      onboardingStep: 5,
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    update: {
      jobNumberPrefix: input.jobPrefix,
      timezone: input.timezone,
    },
    create: {
      organizationId: organization.id,
      jobNumberPrefix: input.jobPrefix,
      timezone: input.timezone,
      requireClientSignature: true,
      requireGps: true,
      gpsReviewDistanceMeters: 250,
      allowManualTime: false,
      allowOvertimeRequests: true,
      requireRiskAssessment: input.slug === 'northstar-electrical',
      defaultDailyHoursLimit: 8,
      defaultWeeklyHoursLimit: 40,
    },
  });

  const maxJobNumber = input.jobs.reduce((max, job) => {
    const numeric = Number(job.jobNumber.split('-')[1] ?? '0');
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);

  await prisma.organizationCounter.upsert({
    where: { organizationId: organization.id },
    update: { jobNext: maxJobNumber + 1 },
    create: { organizationId: organization.id, jobNext: maxJobNumber + 1 },
  });

  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt);
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + 14);
  const graceEndsAt = new Date(trialStartedAt);
  graceEndsAt.setUTCDate(graceEndsAt.getUTCDate() + 17);
  const currentPeriodEnd = new Date(trialStartedAt);
  currentPeriodEnd.setUTCFullYear(currentPeriodEnd.getUTCFullYear() + 1);

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    update: {
      planId,
      status: SubscriptionStatus.ACTIVE,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      activatedAt: trialStartedAt,
      currentPeriodStart: trialStartedAt,
      currentPeriodEnd,
    },
    create: {
      organizationId: organization.id,
      planId,
      status: SubscriptionStatus.ACTIVE,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      activatedAt: trialStartedAt,
      currentPeriodStart: trialStartedAt,
      currentPeriodEnd,
    },
  });

  const userIds: Record<string, string> = {};

  for (const person of input.users) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {
        fullName: person.fullName,
        phone: person.phone,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: person.email,
        fullName: person.fullName,
        phone: person.phone,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    userIds[person.email] = user.id;

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: { role: person.role, status: MembershipStatus.ACTIVE },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: person.role,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  const owner = input.users.find((user) => user.role === OrganizationRole.OWNER);
  if (owner) {
    await prisma.organizationInvitation.upsert({
      where: {
        tokenHash: `seed-invite-${input.slug}`,
      },
      update: {
        email: `invitee@${input.slug}.fieldops.local`,
        role: OrganizationRole.TECHNICIAN,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: userIds[owner.email],
      },
      create: {
        organizationId: organization.id,
        email: `invitee@${input.slug}.fieldops.local`,
        role: OrganizationRole.TECHNICIAN,
        tokenHash: `seed-invite-${input.slug}`,
        invitedById: userIds[owner.email],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: InvitationStatus.PENDING,
      },
    });
  }

  const teamIds: Record<string, string> = {};
  for (const team of input.teams) {
    const row = await prisma.team.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: team.name,
        },
      },
      update: {
        code: team.code ?? null,
        description: team.description ?? null,
        supervisorUserId: team.supervisorEmail
          ? userIds[team.supervisorEmail]
          : null,
      },
      create: {
        organizationId: organization.id,
        name: team.name,
        code: team.code ?? null,
        description: team.description ?? null,
        supervisorUserId: team.supervisorEmail
          ? userIds[team.supervisorEmail]
          : null,
      },
    });
    teamIds[team.name] = row.id;

    for (const memberEmail of team.memberEmails) {
      await prisma.teamMember.upsert({
        where: {
          teamId_userId: {
            teamId: row.id,
            userId: userIds[memberEmail],
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          teamId: row.id,
          userId: userIds[memberEmail],
        },
      });
    }
  }

  for (const skill of input.skills) {
    const skillRow = await prisma.skill.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: skill.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: skill.name,
      },
    });
    for (const email of skill.emails) {
      await prisma.technicianSkill.upsert({
        where: {
          userId_skillId: {
            userId: userIds[email],
            skillId: skillRow.id,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          userId: userIds[email],
          skillId: skillRow.id,
        },
      });
    }
  }

  for (const cert of input.certifications) {
    const existing = await prisma.technicianCertification.findFirst({
      where: {
        organizationId: organization.id,
        userId: userIds[cert.email],
        name: cert.name,
      },
    });
    if (existing) {
      await prisma.technicianCertification.update({
        where: { id: existing.id },
        data: {
          certificateNumber: cert.certificateNumber ?? null,
          issuedAt: cert.issuedAt ?? null,
          expiresAt: cert.expiresAt ?? null,
        },
      });
    } else {
      await prisma.technicianCertification.create({
        data: {
          organizationId: organization.id,
          userId: userIds[cert.email],
          name: cert.name,
          certificateNumber: cert.certificateNumber ?? null,
          issuedAt: cert.issuedAt ?? null,
          expiresAt: cert.expiresAt ?? null,
        },
      });
    }
  }

  const clientIds: Record<string, string> = {};
  const siteIds: Record<string, string> = {};

  for (const client of input.clients) {
    const clientRow = await prisma.client.upsert({
      where: {
        organizationId_accountCode: {
          organizationId: organization.id,
          accountCode: client.accountCode,
        },
      },
      update: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        primaryContactName: client.sites[0]?.contactName,
        primaryContactEmail: client.email,
        primaryContactPhone: client.phone,
      },
      create: {
        organizationId: organization.id,
        name: client.name,
        accountCode: client.accountCode,
        email: client.email,
        phone: client.phone,
        primaryContactName: client.sites[0]?.contactName,
        primaryContactEmail: client.email,
        primaryContactPhone: client.phone,
      },
    });
    clientIds[client.accountCode] = clientRow.id;

    for (const site of client.sites) {
      const existing = await prisma.site.findFirst({
        where: {
          organizationId: organization.id,
          clientId: clientRow.id,
          name: site.name,
        },
      });

      const siteRow =
        existing ??
        (await prisma.site.create({
          data: {
            organizationId: organization.id,
            clientId: clientRow.id,
            name: site.name,
            city: site.city,
            region: site.region,
            postalCode: site.postalCode,
            country: site.country,
            latitude: site.latitude,
            longitude: site.longitude,
            siteContactName: site.contactName,
            siteContactEmail: site.contactEmail,
            siteContactPhone: site.contactPhone,
          },
        }));

      siteIds[`${client.accountCode}:${site.name}`] = siteRow.id;

      const existingContact = await prisma.siteContact.findFirst({
        where: {
          organizationId: organization.id,
          siteId: siteRow.id,
          email: site.contactEmail,
        },
      });

      if (!existingContact) {
        await prisma.siteContact.create({
          data: {
            organizationId: organization.id,
            siteId: siteRow.id,
            name: site.contactName,
            title: site.contactTitle,
            phone: site.contactPhone,
            email: site.contactEmail,
            isPrimary: true,
          },
        });
      }
    }
  }

  for (const job of input.jobs) {
    const supervisorUserId = userIds[job.supervisorEmail];
    const clientId = clientIds[job.clientAccountCode];
    const siteId = siteIds[`${job.clientAccountCode}:${job.siteName}`];
    const teamId = teamIds[job.teamName];

    const jobRow = await prisma.job.upsert({
      where: {
        organizationId_jobNumber: {
          organizationId: organization.id,
          jobNumber: job.jobNumber,
        },
      },
      update: {
        title: job.title,
        status: job.status,
        priority: job.priority,
        jobType: job.jobType,
        scope: job.scope,
        supervisorUserId,
        teamId,
        clientRepName: job.clientRepName,
        scheduledStart: new Date(),
        expectedFinish: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
      create: {
        organizationId: organization.id,
        jobNumber: job.jobNumber,
        title: job.title,
        clientId,
        siteId,
        jobType: job.jobType,
        priority: job.priority,
        teamId,
        supervisorUserId,
        scheduledStart: new Date(),
        expectedFinish: new Date(Date.now() + 8 * 60 * 60 * 1000),
        scope: job.scope,
        status: job.status,
        clientRepName: job.clientRepName,
      },
    });

    for (const technicianEmail of job.technicianEmails) {
      await prisma.jobAssignment.upsert({
        where: {
          jobId_userId: {
            jobId: jobRow.id,
            userId: userIds[technicianEmail],
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          jobId: jobRow.id,
          userId: userIds[technicianEmail],
        },
      });
    }

    const existingLog = await prisma.jobWorkLog.findFirst({
      where: { organizationId: organization.id, jobId: jobRow.id },
    });
    if (!existingLog) {
      await prisma.jobWorkLog.create({
        data: {
          organizationId: organization.id,
          jobId: jobRow.id,
          authorUserId: supervisorUserId,
          body: `Seeded scope: ${job.scope}`,
        },
      });
    }

    const objectKey = `organizations/${organization.id}/jobs/${jobRow.id}/notes/seed-scope.txt`;
    await prisma.jobFile.upsert({
      where: { objectKey },
      update: {},
      create: {
        organizationId: organization.id,
        jobId: jobRow.id,
        objectKey,
        originalName: 'seed-scope.txt',
        mimeType: 'text/plain',
        sizeBytes: 64n,
        type: 'DOCUMENT',
        uploadedById: supervisorUserId,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: userIds[input.users[0].email],
      action: 'organization.seeded',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { slug: input.slug },
    },
  });

  return organization;
}

async function seedClockSessions(prisma: PrismaClient) {
  const northstar = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'northstar-electrical' },
  });
  const bluepeak = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'bluepeak-hvac' },
  });

  const northstarJob = await prisma.job.findFirstOrThrow({
    where: { organizationId: northstar.id, jobNumber: 'NS-1001' },
  });
  const northstarTech = await prisma.user.findUniqueOrThrow({
    where: { email: 'sam.ortega@northstar.fieldops.local' },
  });

  const existingOpen = await prisma.clockSession.findFirst({
    where: {
      technicianUserId: northstarTech.id,
      status: ClockSessionStatus.OPEN,
    },
  });
  if (!existingOpen) {
    await prisma.clockSession.create({
      data: {
        organizationId: northstar.id,
        technicianUserId: northstarTech.id,
        jobId: northstarJob.id,
        clockInAt: new Date(),
        clockInLatitude: '41.8930000',
        clockInLongitude: '-87.6230000',
        clockInAccuracyMeters: '12.50',
        status: ClockSessionStatus.OPEN,
      },
    });
  }

  const bluepeakJob = await prisma.job.findFirstOrThrow({
    where: { organizationId: bluepeak.id, jobNumber: 'BP-1002' },
  });
  const bluepeakTech = await prisma.user.findUniqueOrThrow({
    where: { email: 'ivy.march@bluepeak.fieldops.local' },
  });

  const existingClosed = await prisma.clockSession.findFirst({
    where: {
      technicianUserId: bluepeakTech.id,
      jobId: bluepeakJob.id,
      status: ClockSessionStatus.CLOSED,
    },
  });
  if (!existingClosed) {
    const clockInAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.clockSession.create({
      data: {
        organizationId: bluepeak.id,
        technicianUserId: bluepeakTech.id,
        jobId: bluepeakJob.id,
        clockInAt,
        clockOutAt: new Date(),
        clockInLatitude: '39.7047000',
        clockInLongitude: '-105.0814000',
        clockOutLatitude: '39.7048000',
        clockOutLongitude: '-105.0815000',
        status: ClockSessionStatus.CLOSED,
      },
    });
  }
}

async function seedPlatformAdmin(prisma: PrismaClient, passwordHash: string) {
  await prisma.user.upsert({
    where: { email: 'platform.admin@fieldops.local' },
    update: {
      fullName: 'Platform Admin',
      platformRole: PlatformRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: 'platform.admin@fieldops.local',
      fullName: 'Platform Admin',
      platformRole: PlatformRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });
}

async function main() {
  const prisma = createPrismaClient();
  const passwordHash = await hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  const plans = await seedPlans(prisma);

  for (const org of organizations) {
    const plan = plans[org.planCode];
    if (!plan) {
      throw new Error(`Missing plan ${org.planCode}`);
    }
    await seedOrganization(prisma, passwordHash, plan.id, org);
  }

  await seedClockSessions(prisma);
  await seedPlatformAdmin(prisma, passwordHash);

  console.log('FieldOps Cloud development seed complete.');
  console.log(`Shared local password: ${SEED_PASSWORD}`);
  console.log('Organizations: northstar-electrical, bluepeak-hvac');
  console.log('Platform admin: platform.admin@fieldops.local');

  await prisma.$disconnect();
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

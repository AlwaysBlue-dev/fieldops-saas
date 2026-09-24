/**
 * Development / controlled bootstrap: create the first Platform SUPER_ADMIN.
 *
 * Not a public API. Does not change signup. Never creates an Organization.
 *
 * Usage:
 *   npm run admin:create -- --email=admin@example.com --fullName="Platform Admin" --password="..."
 *   ADMIN_EMAIL=... ADMIN_FULL_NAME=... ADMIN_PASSWORD=... npm run admin:create
 *   npm run admin:create   (interactive prompts)
 *
 * Existing USER accounts are not promoted unless --promote is passed explicitly.
 */
import { config } from 'dotenv';
import { randomUUID, webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  PlatformRole,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { hashPassword, normalizeEmail } from '../src/auth/password.js';

// ESM/tsx does not always expose a free `crypto` binding. Some dependencies
// (and Prisma's runtime UUID helpers) expect globalThis.crypto.
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

config();

const MIN_PASSWORD_LENGTH = 10;

type Options = {
  email: string;
  fullName: string;
  password: string;
  promote: boolean;
};

function parseArgs(argv: string[]): Partial<Options> & { promote: boolean; help?: boolean } {
  const result: Partial<Options> & { promote: boolean; help?: boolean } = {
    promote: false,
  };

  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      result.help = true;
      continue;
    }
    if (raw === '--promote') {
      result.promote = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'email') result.email = value;
    if (key === 'fullName' || key === 'full-name' || key === 'name') {
      result.fullName = value;
    }
    if (key === 'password') result.password = value;
    if (key === 'promote') {
      result.promote = value === 'true' || value === '1';
    }
  }

  return result;
}

function printHelp() {
  console.log(`Create a Platform SUPER_ADMIN (CLI only; not a public API).

Usage:
  npm run admin:create -- --email=admin@example.com --fullName="Platform Admin" --password="..."
  ADMIN_EMAIL=... ADMIN_FULL_NAME=... ADMIN_PASSWORD=... npm run admin:create
  npm run admin:create

Options:
  --email=        Admin email
  --fullName=     Display name
  --password=     Password (min ${MIN_PASSWORD_LENGTH} characters)
  --promote       Explicitly upgrade an existing USER account to SUPER_ADMIN
                  (refused by default; never done silently)

Environment (used when flags are omitted):
  ADMIN_EMAIL
  ADMIN_FULL_NAME
  ADMIN_PASSWORD

Safety:
  Refused when NODE_ENV=production unless ALLOW_PLATFORM_ADMIN_BOOTSTRAP=1.
  Does not create an organization.
  Does not print the password after creation.
`);
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function resolveOptions(argv: string[]): Promise<Options | null> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  let email =
    args.email?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    '';
  let fullName =
    args.fullName?.trim() ||
    process.env.ADMIN_FULL_NAME?.trim() ||
    '';
  let password =
    args.password ||
    process.env.ADMIN_PASSWORD ||
    '';

  if (!email) {
    email = await prompt('Email: ');
  }
  if (!fullName) {
    fullName = await prompt('Full name: ');
  }
  if (!password) {
    console.log(
      '(Prefer --password= or ADMIN_PASSWORD so the secret is not typed interactively.)',
    );
    password = await prompt('Password: ');
  }

  return {
    email,
    fullName,
    password,
    promote: args.promote,
  };
}

function assertSafeEnvironment() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PLATFORM_ADMIN_BOOTSTRAP !== '1'
  ) {
    console.error(
      'Refused: admin:create is disabled in production without ALLOW_PLATFORM_ADMIN_BOOTSTRAP=1.',
    );
    process.exit(1);
  }
}

function validate(options: Options) {
  const email = normalizeEmail(options.email);
  if (!email || !email.includes('@')) {
    throw new Error('A valid email is required.');
  }
  if (!options.fullName.trim()) {
    throw new Error('Full name is required.');
  }
  if (options.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return {
    email,
    fullName: options.fullName.trim(),
    password: options.password,
    promote: options.promote,
  };
}

async function main() {
  assertSafeEnvironment();

  const options = await resolveOptions(process.argv.slice(2));
  if (!options) {
    process.exit(0);
  }

  const input = validate(options);
  const prisma = createPrismaClient();

  try {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        platformRole: true,
        status: true,
      },
    });

    if (existing) {
      if (existing.platformRole === PlatformRole.SUPER_ADMIN) {
        console.log(
          `Account already exists as SUPER_ADMIN: ${existing.email} (${existing.id})`,
        );
        console.log('No changes made.');
        process.exit(0);
      }

      if (!input.promote) {
        console.error(
          `Account already exists as ${existing.platformRole}: ${existing.email} (${existing.id})`,
        );
        console.error(
          'Refusing to promote silently. Re-run with --promote only if you intentionally want to upgrade this user to SUPER_ADMIN.',
        );
        process.exit(1);
      }

      const passwordHash = await hashPassword(input.password);
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          platformRole: PlatformRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          fullName: input.fullName,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          platformRole: true,
          status: true,
        },
      });

      console.log('Existing account promoted to SUPER_ADMIN.');
      console.log(`  id:            ${updated.id}`);
      console.log(`  email:         ${updated.email}`);
      console.log(`  fullName:      ${updated.fullName}`);
      console.log(`  platformRole:  ${updated.platformRole}`);
      console.log(`  status:        ${updated.status}`);
      console.log('Password was updated (not printed).');
      process.exit(0);
    }

    const passwordHash = await hashPassword(input.password);
    const created = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        platformRole: PlatformRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        platformRole: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    console.log('Platform SUPER_ADMIN created.');
    console.log(`  id:            ${created.id}`);
    console.log(`  email:         ${created.email}`);
    console.log(`  fullName:      ${created.fullName}`);
    console.log(`  platformRole:  ${created.platformRole}`);
    console.log(`  status:        ${created.status}`);
    console.log(
      `  emailVerified: ${created.emailVerifiedAt?.toISOString() ?? 'n/a'}`,
    );
    console.log('No organization was created (platform role is separate).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`Failed to create platform admin: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error('Failed to create platform admin:', error);
  }
  process.exit(1);
});

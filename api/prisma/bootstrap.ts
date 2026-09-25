/**
 * Required platform/system bootstrap only.
 *
 * Upserts Plan catalog (starter / professional / business).
 * Does NOT create organizations, members, demo data, or SUPER_ADMIN.
 *
 * New workspace trials look up Plan.code = TRIAL_PLAN_CODE (`professional`).
 *
 * Usage: npm run db:bootstrap
 */
import { config } from 'dotenv';
import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { upsertPlans } from './plans-catalog.js';

config();

async function main() {
  const prisma = createPrismaClient();
  try {
    const plans = await upsertPlans(prisma);
    console.log('FieldKeel bootstrap complete (plans only).');
    for (const code of Object.keys(plans).sort()) {
      const plan = plans[code];
      console.log(`  plan ${plan.code} → ${plan.id} (${plan.name})`);
    }
    console.log('Trial signup expects plan code: professional');
    console.log('Platform SUPER_ADMIN is not created here — use: npm run admin:create');
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

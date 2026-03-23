import { seedCategories } from './categories.js';
import { seedTags } from './tags.js';
import { seedUseCases } from './use-cases.js';
import { seedBuiltinTools } from './builtin-tools.js';
import { seedAdminUser } from './admin-user.js';
import { seedCatalogItems } from './catalog-items.js';
import { seedDtfNewsAgent } from './dtf-news-agent.js';

async function main() {
  console.log('Starting database seed...');

  await seedCategories();
  await seedTags();
  await seedUseCases();
  await seedBuiltinTools();
  await seedAdminUser();
  await seedCatalogItems();
  await seedDtfNewsAgent();

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

import { seedCategories } from './categories.js';
import { seedTags } from './tags.js';
import { seedUseCases } from './use-cases.js';
import { seedBuiltinTools } from './builtin-tools.js';
import { seedAdminUser } from './admin-user.js';
import { seedCatalogItems } from './catalog-items.js';
import { seedDtfNewsAgent } from './dtf-news-agent.js';
import { seedCreativeLandingBuilderAgent } from './creative-landing-builder-agent.js';
import { seedKimiCreativeLandingBuilderAgent } from './kimi-creative-landing-builder-agent.js';
import { seedLandingBuilderWebSearchAgent } from './landing-builder-web-search-agent.js';
import { seedFullstackLandingBuilderAgent } from './fullstack-landing-builder-agent.js';
import { seedOpenRouterCodingAgent } from './openrouter-coding-agent.js';
import { seedWebSearchAgent } from './web-search-agent.js';

async function main() {
  console.log('Starting database seed...');

  await seedCategories();
  await seedTags();
  await seedUseCases();
  await seedBuiltinTools();
  await seedAdminUser();
  await seedCatalogItems();
  await seedDtfNewsAgent();
  await seedCreativeLandingBuilderAgent();
  await seedKimiCreativeLandingBuilderAgent();
  await seedLandingBuilderWebSearchAgent();
  await seedFullstackLandingBuilderAgent();
  await seedOpenRouterCodingAgent();
  await seedWebSearchAgent();

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

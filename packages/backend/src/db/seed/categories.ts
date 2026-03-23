import { db } from '../../config/database.js';
import { categories } from '../schema/catalog.js';

const defaultCategories = [
  // Top-level categories
  { name: 'Языковые модели', slug: 'language-models', parent_id: null },
  { name: 'Инструменты', slug: 'tools', parent_id: null },
  { name: 'Генерация', slug: 'generation', parent_id: null },
  { name: 'Аналитика', slug: 'analytics', parent_id: null },
  { name: 'Автоматизация', slug: 'automation', parent_id: null },
  { name: 'Разработка', slug: 'development', parent_id: null },
  { name: 'Бизнес', slug: 'business', parent_id: null },
  { name: 'Локальные решения', slug: 'local-solutions', parent_id: null },
  { name: 'Русскоязычные модели', slug: 'russian-models', parent_id: null },
];

export async function seedCategories() {
  for (const cat of defaultCategories) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoNothing({ target: categories.slug });
  }
  console.log(`Seeded ${defaultCategories.length} categories`);
}

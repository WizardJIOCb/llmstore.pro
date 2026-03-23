import { db } from '../../config/database.js';
import { useCases } from '../schema/catalog.js';

const defaultUseCases = [
  { name: 'Кодирование', slug: 'coding' },
  { name: 'Чат', slug: 'chat' },
  { name: 'RAG', slug: 'rag' },
  { name: 'Поддержка клиентов', slug: 'support' },
  { name: 'Голосовые интерфейсы', slug: 'voice' },
  { name: 'OCR', slug: 'ocr' },
  { name: 'Генерация контента', slug: 'content' },
  { name: 'Автоматизация', slug: 'automation' },
  { name: 'Аналитика', slug: 'analytics' },
  { name: 'Агентные воркфлоу', slug: 'agentic-workflows' },
  { name: 'Суммаризация', slug: 'summarization' },
  { name: 'Перевод', slug: 'translation' },
  { name: 'Извлечение данных', slug: 'data-extraction' },
  { name: 'Telegram-боты', slug: 'telegram-bots' },
  { name: 'Рекрутинг', slug: 'recruiting' },
];

export async function seedUseCases() {
  for (const uc of defaultUseCases) {
    await db
      .insert(useCases)
      .values(uc)
      .onConflictDoNothing({ target: useCases.slug });
  }
  console.log(`Seeded ${defaultUseCases.length} use cases`);
}

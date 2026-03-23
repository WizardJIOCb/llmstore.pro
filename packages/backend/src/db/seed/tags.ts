import { db } from '../../config/database.js';
import { tags } from '../schema/catalog.js';

const defaultTags = [
  { name: 'GPT-4', slug: 'gpt-4' },
  { name: 'Claude', slug: 'claude' },
  { name: 'Llama', slug: 'llama' },
  { name: 'Mistral', slug: 'mistral' },
  { name: 'Open Source', slug: 'open-source' },
  { name: 'Tool Calling', slug: 'tool-calling' },
  { name: 'Structured Output', slug: 'structured-output' },
  { name: 'Vision', slug: 'vision' },
  { name: 'Reasoning', slug: 'reasoning' },
  { name: 'Coding', slug: 'coding' },
  { name: 'RAG', slug: 'rag' },
  { name: 'Русский язык', slug: 'russian-language' },
  { name: 'Чат', slug: 'chat' },
  { name: 'Локальный', slug: 'local' },
  { name: 'API', slug: 'api' },
  { name: 'Бесплатный', slug: 'free' },
  { name: 'Приватность', slug: 'privacy' },
  { name: 'STT', slug: 'stt' },
  { name: 'TTS', slug: 'tts' },
  { name: 'OCR', slug: 'ocr' },
  { name: 'Telegram', slug: 'telegram' },
  { name: 'Поддержка', slug: 'support' },
  { name: 'Контент', slug: 'content' },
  { name: 'Агент', slug: 'agent' },
];

export async function seedTags() {
  for (const tag of defaultTags) {
    await db
      .insert(tags)
      .values(tag)
      .onConflictDoNothing({ target: tags.slug });
  }
  console.log(`Seeded ${defaultTags.length} tags`);
}

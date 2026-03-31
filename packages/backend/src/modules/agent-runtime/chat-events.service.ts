import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { chatConversations } from '../../db/schema/runtime.js';
import { SSEEmitter } from '../../lib/sse-emitter.js';
import { NotFoundError } from '../../middleware/error-handler.js';

const HEARTBEAT_MS = 15_000;
const subscribers = new Map<string, Set<SSEEmitter>>();

function getStreamKey(chatId: string, userId: string) {
  return `${userId}:${chatId}`;
}

function getSubscriberSet(chatId: string, userId: string) {
  const key = getStreamKey(chatId, userId);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set<SSEEmitter>();
    subscribers.set(key, set);
  }
  return { key, set };
}

export async function openChatEventStream(chatId: string, userId: string, res: Response) {
  const [chat] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, chatId), eq(chatConversations.user_id, userId)))
    .limit(1);

  if (!chat) {
    throw new NotFoundError('Ресурс не найден');
  }

  const emitter = new SSEEmitter(res);
  const { key, set } = getSubscriberSet(chatId, userId);
  set.add(emitter);

  emitter.send('connected', {
    chat_id: chatId,
    ts: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => emitter.heartbeat(), HEARTBEAT_MS);

  emitter.onClientDisconnect(() => {
    clearInterval(heartbeat);
    set.delete(emitter);
    if (set.size === 0) {
      subscribers.delete(key);
    }
  });
}

export function publishChatEvent(chatId: string, userId: string, event: string, data: Record<string, unknown>) {
  const set = subscribers.get(getStreamKey(chatId, userId));
  if (!set || set.size === 0) return;

  for (const emitter of set) {
    emitter.send(event, {
      ...data,
      chat_id: chatId,
      ts: new Date().toISOString(),
    });
  }
}

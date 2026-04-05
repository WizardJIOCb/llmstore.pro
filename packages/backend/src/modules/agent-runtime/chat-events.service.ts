import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { chatConversations } from '../../db/schema/runtime.js';
import { SSEEmitter } from '../../lib/sse-emitter.js';
import { NotFoundError } from '../../middleware/error-handler.js';

const HEARTBEAT_MS = 15_000;
const subscribers = new Map<string, Set<SSEEmitter>>();

function getStreamKey(chatId: string, userId: string) {
  return `chat:${userId}:${chatId}`;
}

function getSharedStreamKey(token: string) {
  return `shared:${token}`;
}

function getSubscriberSet(key: string) {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set<SSEEmitter>();
    subscribers.set(key, set);
  }
  return { key, set };
}

function attachEmitter(setKey: string, emitter: SSEEmitter) {
  const { key, set } = getSubscriberSet(setKey);
  set.add(emitter);

  const heartbeat = setInterval(() => emitter.heartbeat(), HEARTBEAT_MS);
  emitter.onClientDisconnect(() => {
    clearInterval(heartbeat);
    set.delete(emitter);
    if (set.size === 0) {
      subscribers.delete(key);
    }
  });
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
  attachEmitter(getStreamKey(chatId, userId), emitter);

  emitter.send('connected', {
    chat_id: chatId,
    ts: new Date().toISOString(),
  });
}

export async function openSharedChatEventStream(token: string, res: Response) {
  const [chat] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.share_token, token))
    .limit(1);

  if (!chat) {
    throw new NotFoundError('Ресурс не найден');
  }

  const emitter = new SSEEmitter(res);
  attachEmitter(getSharedStreamKey(token), emitter);

  emitter.send('connected', {
    share_token: token,
    ts: new Date().toISOString(),
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

export function publishSharedChatEvent(token: string, event: string, data: Record<string, unknown>) {
  const set = subscribers.get(getSharedStreamKey(token));
  if (!set || set.size === 0) return;

  for (const emitter of set) {
    emitter.send(event, {
      ...data,
      share_token: token,
      ts: new Date().toISOString(),
    });
  }
}

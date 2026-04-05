import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { chatConversations } from '../../db/schema/runtime.js';
import { SSEEmitter } from '../../lib/sse-emitter.js';
import { NotFoundError } from '../../middleware/error-handler.js';

const HEARTBEAT_MS = 15_000;
const subscribers = new Map<string, Set<SSEEmitter>>();
const eventHistory = new Map<string, Array<{ event: string; data: Record<string, unknown> }>>();
const MAX_EVENT_HISTORY = 32;

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

function rememberEvent(key: string, event: string, data: Record<string, unknown>) {
  const history = eventHistory.get(key) ?? [];
  history.push({ event, data });
  if (history.length > MAX_EVENT_HISTORY) {
    history.splice(0, history.length - MAX_EVENT_HISTORY);
  }
  eventHistory.set(key, history);
}

function replayEventHistory(key: string, emitter: SSEEmitter) {
  const history = eventHistory.get(key);
  if (!history || history.length === 0) return;

  for (const item of history) {
    emitter.send(item.event, item.data);
  }
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
  const streamKey = getStreamKey(chatId, userId);
  attachEmitter(streamKey, emitter);

  emitter.send('connected', {
    chat_id: chatId,
    ts: new Date().toISOString(),
  });
  replayEventHistory(streamKey, emitter);
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
  const streamKey = getSharedStreamKey(token);
  attachEmitter(streamKey, emitter);

  emitter.send('connected', {
    share_token: token,
    ts: new Date().toISOString(),
  });
  replayEventHistory(streamKey, emitter);
}

export function publishChatEvent(chatId: string, userId: string, event: string, data: Record<string, unknown>) {
  const streamKey = getStreamKey(chatId, userId);
  const payload = {
    ...data,
    chat_id: chatId,
    ts: new Date().toISOString(),
  };
  rememberEvent(streamKey, event, payload);

  const set = subscribers.get(streamKey);
  if (!set || set.size === 0) return;

  for (const emitter of set) {
    emitter.send(event, payload);
  }
}

export function publishSharedChatEvent(token: string, event: string, data: Record<string, unknown>) {
  const streamKey = getSharedStreamKey(token);
  const payload = {
    ...data,
    share_token: token,
    ts: new Date().toISOString(),
  };
  rememberEvent(streamKey, event, payload);

  const set = subscribers.get(streamKey);
  if (!set || set.size === 0) return;

  for (const emitter of set) {
    emitter.send(event, payload);
  }
}

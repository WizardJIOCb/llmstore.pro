import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import * as controller from './runtime.controller.js';
import {
  validateStartRun,
  validateCreateChat,
  validateUpdateChat,
  validateSendChatMessage,
} from './runtime.validators.js';

const router = Router();

// Chat history (authenticated)
router.get('/agents/:agentId/chat', requireAuth, controller.getChatHistory);
router.post('/agents/:agentId/chat/share', requireAuth, controller.shareChat);
router.post('/agents/:agentId/chat/clear', requireAuth, controller.clearChat);

// Shared chat (public — no auth)
router.get('/shared/chat/:token', controller.getSharedChat);

// Conversations V2 (authenticated)
router.get('/chats', requireAuth, controller.listChats);
router.post('/chats', requireAuth, validateCreateChat, controller.createChat);
router.get('/chats/:chatId', requireAuth, controller.getChatById);
router.patch('/chats/:chatId', requireAuth, validateUpdateChat, controller.updateChat);
router.delete('/chats/:chatId', requireAuth, controller.deleteChat);
router.post('/chats/:chatId/share', requireAuth, controller.shareChatById);
router.post('/chats/:chatId/messages', requireAuth, validateSendChatMessage, controller.sendChatMessage);

// Shared conversation (public, no auth)
router.get('/shared/chats/:token', controller.getSharedChatById);

// Runs
router.post('/agents/:agentId/runs', requireAuth, validateStartRun, controller.startRun);
router.get('/runs/:id', requireAuth, controller.getRun);
router.get('/runs', requireAuth, controller.listRuns);

export const agentRuntimeRoutes = router;

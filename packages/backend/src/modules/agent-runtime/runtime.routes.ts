import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import * as controller from './runtime.controller.js';
import { chatBundleUpload, chatUpload } from '../../config/upload.js';
import {
  validateStartRun,
  validateCreateChat,
  validateUpdateChat,
  validateSendChatMessage,
  validateUpdateMessagePreview,
  validateSetGalleryReaction,
  validateUpsertProjectDeployment,
  validateProjectDeploymentAgentRun,
} from './runtime.validators.js';

const router = Router();

// Chat history (authenticated)
router.get('/agents/:agentId/chat', requireAuth, controller.getChatHistory);
router.post('/agents/:agentId/chat/share', requireAuth, controller.shareChat);
router.post('/agents/:agentId/chat/clear', requireAuth, controller.clearChat);

// Shared chat (public — no auth)
router.get('/shared/chat/:token', controller.getSharedChat);

// Conversations V2 (authenticated)
router.get('/emoji/:code.svg', controller.getEmojiSvg);
router.get('/gallery/previews', controller.listGalleryPreviews);
router.post('/gallery/previews/:chatId/reaction', requireAuth, validateSetGalleryReaction, controller.setGalleryPreviewReaction);
router.delete('/gallery/previews/:chatId/reaction', requireAuth, controller.deleteGalleryPreviewReaction);
router.post('/gallery/previews/:chatId/messages/:messageId/project-run', requireAuth, controller.runGalleryPreviewProject);
router.all('/project-deployments/:token/webhook*', controller.proxyProjectDeploymentWebhook);
router.post('/project-deployments/:token/agent-run', validateProjectDeploymentAgentRun, controller.runLinkedAgentForProjectDeployment);
router.get('/chats', requireAuth, controller.listChats);
router.get('/chats/agents', requireAuth, controller.listChatAgents);
router.post('/chats', requireAuth, validateCreateChat, controller.createChat);
router.post('/chats/import', requireAuth, chatBundleUpload.single('file'), controller.importChatBundle);
router.get('/chats/:chatId/export', requireAuth, controller.exportChatBundle);
router.get('/chats/:chatId/messages/:messageId/preview', controller.getChatMessagePreview);
router.patch('/chats/:chatId/messages/:messageId/preview', requireAuth, validateUpdateMessagePreview, controller.updateChatMessagePreview);
router.post('/chats/:chatId/messages/:messageId/project-run', requireAuth, controller.runChatMessageProject);
router.get('/chats/:chatId/messages/:messageId/project-deployment', requireAuth, controller.getChatMessageProjectDeployment);
router.post('/chats/:chatId/messages/:messageId/project-deployment', requireAuth, validateUpsertProjectDeployment, controller.upsertChatMessageProjectDeployment);
router.post('/chats/:chatId/messages/:messageId/project-deployment/start', requireAuth, controller.startChatMessageProjectDeployment);
router.post('/chats/:chatId/messages/:messageId/project-deployment/reinstall-webhook', requireAuth, controller.reinstallTelegramWebhookForChatMessageProjectDeployment);
router.post('/chats/:chatId/messages/:messageId/project-deployment/stop', requireAuth, controller.stopChatMessageProjectDeployment);
router.get('/chats/:chatId', requireAuth, controller.getChatById);
router.get('/chats/:chatId/events', requireAuth, controller.streamChatEvents);
router.get('/chats/:chatId/stats', requireAuth, controller.getChatStats);
router.patch('/chats/:chatId', requireAuth, validateUpdateChat, controller.updateChat);
router.delete('/chats/:chatId', requireAuth, controller.deleteChat);
router.delete('/chats/:chatId/messages/:messageId', requireAuth, controller.deleteChatMessage);
router.post('/chats/:chatId/messages/:messageId/truncate', requireAuth, controller.truncateChatFromMessage);
router.post('/chats/:chatId/share', requireAuth, controller.shareChatById);
router.post('/chats/uploads', requireAuth, chatUpload.array('files', 8), controller.uploadChatFiles);
router.post('/chats/:chatId/messages', requireAuth, validateSendChatMessage, controller.sendChatMessage);

// Shared conversation (public, no auth)
router.get('/shared/chats/:token/messages/:messageId/preview', controller.getSharedChatMessagePreview);
router.patch('/shared/chats/:token/messages/:messageId/preview', requireAuth, validateUpdateMessagePreview, controller.updateSharedChatMessagePreview);
router.get('/shared/chats/:token', controller.getSharedChatById);
router.get('/shared/chats/:token/export', controller.exportSharedChatBundle);

// Runs
router.post('/agents/:agentId/runs', requireAuth, validateStartRun, controller.startRun);
router.get('/runs/:id', requireAuth, controller.getRun);
router.get('/runs', requireAuth, controller.listRuns);

export const agentRuntimeRoutes = router;

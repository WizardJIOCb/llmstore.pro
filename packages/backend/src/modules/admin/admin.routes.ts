import { Router } from 'express';
import * as controller from './admin.controller.js';
import {
  validateCreateItem, validateUpdateItem, validateAdminListQuery,
  validateTaxonomyCreate, validateTaxonomyUpdate,
  validateCreateTool, validateUpdateTool,
  validateUpdateAdminSettings, validateAdminChartsQuery, validateAdminRuntimesQuery, validateAdminDebugChatsQuery, validateAdminAliceLogsQuery, validateResetUserPassword,
} from './admin.validators.js';
import { validateCreateNews, validateUpdateNews, validateAdminNewsListQuery } from '../news/news.validators.js';
import { requireRole } from '../../middleware/auth-guard.js';
import { newsUpload } from '../../config/upload.js';

const router = Router();

// All admin routes require admin or curator role
router.use(requireRole('admin', 'curator'));

// Dashboard stats
router.get('/dashboard/stats', controller.getDashboardStats);
router.get('/dashboard/charts', validateAdminChartsQuery, controller.getDashboardCharts);
router.get('/alice/logs', validateAdminAliceLogsQuery, controller.listAliceLogs);
router.get('/runtimes', validateAdminRuntimesQuery, controller.listRuntimes);
router.get('/debug/chats', validateAdminDebugChatsQuery, controller.searchDebugChats);
router.get('/debug/chats/:id', controller.getDebugChat);
router.post('/runtimes/:id/start', controller.startRuntime);
router.post('/runtimes/:id/stop', controller.stopRuntime);

// Global settings (admin only)
router.get('/settings', requireRole('admin'), controller.getAdminSettings);
router.put('/settings', requireRole('admin'), validateUpdateAdminSettings, controller.updateAdminSettings);

// Catalog items CRUD
router.get('/items', validateAdminListQuery, controller.listItems);
router.get('/items/:id', controller.getItem);
router.post('/items', validateCreateItem, controller.createItem);
router.put('/items/:id', validateUpdateItem, controller.updateItem);
router.delete('/items/:id', controller.deleteItem);

// Categories CRUD
router.post('/categories', validateTaxonomyCreate, controller.createCategory);
router.put('/categories/:id', validateTaxonomyUpdate, controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);

// Tags CRUD
router.post('/tags', validateTaxonomyCreate, controller.createTag);
router.put('/tags/:id', validateTaxonomyUpdate, controller.updateTag);
router.delete('/tags/:id', controller.deleteTag);

// Use cases CRUD
router.post('/use-cases', validateTaxonomyCreate, controller.createUseCase);
router.put('/use-cases/:id', validateTaxonomyUpdate, controller.updateUseCase);
router.delete('/use-cases/:id', controller.deleteUseCase);

// Tools CRUD
router.get('/tools', controller.listTools);
router.post('/tools', validateCreateTool, controller.createTool);
router.put('/tools/:id', validateUpdateTool, controller.updateTool);
router.delete('/tools/:id', controller.deleteTool);

// User management (admin only)
router.get('/users', controller.listUsers);
router.get('/users/:id', controller.getUser);
router.post('/users/:id/impersonate', requireRole('admin'), controller.impersonateUser);
router.put('/users/:id/role', controller.updateUserRole);
router.put('/users/:id/status', controller.updateUserStatus);
router.post('/users/:id/balance', controller.adjustUserBalance);
router.post('/users/:id/password', requireRole('admin'), validateResetUserPassword, controller.resetUserPassword);

// Agents management (admin view)
router.get('/agents', controller.listAllAgents);

// News CRUD
router.get('/news', validateAdminNewsListQuery, controller.listNews);
router.get('/news/:id', controller.getNews);
router.post('/news', validateCreateNews, controller.createNews);
router.put('/news/:id', validateUpdateNews, controller.updateNews);
router.delete('/news/:id', controller.deleteNews);

// News image upload
router.post('/upload/news', newsUpload.array('images', 10), controller.uploadNewsImages);
router.delete('/upload/news/:filename', controller.deleteNewsImage);

export const adminRoutes = router;

import { Router } from 'express';
import * as controller from './admin.controller.js';
import {
  validateCreateItem, validateUpdateItem, validateAdminListQuery,
  validateTaxonomyCreate, validateTaxonomyUpdate,
} from './admin.validators.js';
import { requireRole } from '../../middleware/auth-guard.js';

const router = Router();

// All admin routes require admin or curator role
router.use(requireRole('admin', 'curator'));

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

// User balance management
router.post('/users/:id/balance', controller.adjustUserBalance);

export const adminRoutes = router;

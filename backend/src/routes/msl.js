const { Router } = require('express');
const ctrl = require('../controllers/mslController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// Global default
router.get('/global',               ctrl.getGlobal);
router.put('/global',               ...ctrl.setGlobal);

// Customer defaults
router.get('/customers',            ctrl.listCustomerDefaults);
router.get('/customers/:id',        ctrl.getCustomerDefault);
router.put('/customers/:id',        ...ctrl.setCustomerDefault);
router.delete('/customers/:id',     ctrl.clearCustomerDefault);

// Part overrides
router.get('/overrides',            ctrl.listOverrides);
router.post('/overrides',           ...ctrl.createOverride);
router.put('/overrides/:id',        ...ctrl.updateOverride);
router.delete('/overrides/:id',     ctrl.deleteOverride);
router.post('/overrides/bulk',      ...ctrl.bulkImport);

// Resolver
router.get('/resolve',              ctrl.resolveRange);

module.exports = router;

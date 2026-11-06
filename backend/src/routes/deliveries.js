const { Router } = require('express');
const ctrl = require('../controllers/deliveryController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/kpis',                 ctrl.getDashboardKpis);
router.get('/',                     ctrl.list);
router.get('/:id',                  ctrl.getOne);
router.patch('/:id/schedule',       ...ctrl.updateSchedule);
router.post('/:id/sheet',           ...ctrl.saveSheet);
router.post('/:id/reapply-defaults',ctrl.reapplyDefaults);
router.get('/:id/msl-summary',      ctrl.getMslSummary);
router.delete('/:id',               ctrl.remove);

module.exports = router;

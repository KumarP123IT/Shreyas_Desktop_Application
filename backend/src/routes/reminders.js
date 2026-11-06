const { Router } = require('express');
const ctrl = require('../controllers/reminderController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',                              ctrl.list);
router.post('/delivery/:deliveryId/generate',ctrl.generate);
router.post('/delivery/:deliveryId/restart', ctrl.restart);
router.post('/delivery/:deliveryId/stop',    ctrl.stop);
router.delete('/',                           ctrl.clear);
router.post('/:id/snooze',                   ctrl.snooze);
router.post('/:id/reschedule',               ctrl.reschedule);

module.exports = router;

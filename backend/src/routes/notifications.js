const { Router } = require('express');
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',              ctrl.listLogs);
router.delete('/',           ctrl.clearLogs);
router.post('/:id/retry',   ctrl.retry);
router.get('/internet',     ctrl.internetStatus);

module.exports = router;

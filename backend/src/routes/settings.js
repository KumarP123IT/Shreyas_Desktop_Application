const { Router } = require('express');
const ctrl = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',               ctrl.getAll);
router.patch('/',             ctrl.update);
router.post('/test-email',    ctrl.testEmail);
router.get('/smtp-verify',    ctrl.verifySmtp);
router.get('/waha-status',    ctrl.wahaStatus);
router.get('/waha-qr',        ctrl.wahaQr);
router.post('/test-whatsapp', ctrl.testWhatsapp);

module.exports = router;

const { Router } = require('express');
const ctrl = require('../controllers/webhookController');

const router = Router();
// No auth middleware – WAHA validates via API key in request
router.post('/waha', ctrl.wahaWebhook);

module.exports = router;

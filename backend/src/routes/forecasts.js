const { Router } = require('express');
const ctrl = require('../controllers/forecastController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.post('/parse',          ...ctrl.parsePreview);
router.post('/upload',         ...ctrl.uploadFile);
router.post('/save',           ctrl.saveForecast);
router.get('/',                ctrl.listForecasts);
router.post('/:id/activate',   ctrl.activateForecast);
router.get('/:id/file',        ctrl.downloadFile);

module.exports = router;

const { Router } = require('express');
const ctrl = require('../controllers/stockController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',              ctrl.list);
router.get('/:id',           ctrl.getOne);
router.post('/',             ...ctrl.create);
router.patch('/:id',         ...ctrl.update);
router.post('/:id/adjust',   ...ctrl.adjust);
router.delete('/:id',        ctrl.remove);

module.exports = router;

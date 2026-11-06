const { Router } = require('express');
const ctrl = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',                ctrl.list);
router.post('/',               ...ctrl.create);
router.get('/:id',             ctrl.getOne);
router.patch('/:id',           ...ctrl.update);
router.delete('/:id',          ctrl.archive);
router.post('/:id/restore',    ctrl.restore);

module.exports = router;

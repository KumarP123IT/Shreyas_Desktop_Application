const { Router } = require('express');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/login',           ...ctrl.login);
router.post('/logout',          authenticate, ctrl.logout);
router.get('/me',               authenticate, ctrl.me);
router.patch('/me',             authenticate, ...ctrl.updateProfile);
router.post('/change-password', authenticate, ...ctrl.changePassword);

module.exports = router;

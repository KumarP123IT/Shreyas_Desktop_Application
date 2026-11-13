const { Router } = require('express');
const ctrl        = require('../controllers/customerController');
const invoiceCtrl = require('../controllers/invoiceController');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/',             ctrl.list);
router.post('/',            ...ctrl.create);
router.get('/:id',          ctrl.getOne);
router.patch('/:id',        ...ctrl.update);
router.delete('/:id',       ctrl.archive);
router.post('/:id/restore', ctrl.restore);

// ── Invoice sub-routes ────────────────────────────────────────────────────────
router.get( '/:id/invoices',                      invoiceCtrl.listInvoices);
router.post('/:id/invoices/upload',               ...invoiceCtrl.uploadInvoice);
router.get( '/:id/invoices/:invoiceId',           invoiceCtrl.getInvoice);
router.patch('/:id/invoices/:invoiceId',          invoiceCtrl.updateInvoice);
router.post('/:id/invoices/:invoiceId/apply',     invoiceCtrl.applyInvoice);
router.post('/:id/invoices/:invoiceId/cancel',    invoiceCtrl.cancelInvoice);

module.exports = router;

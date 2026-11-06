/**
 * Mount all API routes.
 */

const { Router } = require('express');
const authRoutes         = require('./auth');
const healthRoutes       = require('./health');
const customerRoutes     = require('./customers');
const mslRoutes          = require('./msl');
const forecastRoutes     = require('./forecasts');
const deliveryRoutes     = require('./deliveries');
const settingsRoutes     = require('./settings');
const reminderRoutes     = require('./reminders');
const notificationRoutes = require('./notifications');
const webhookRoutes      = require('./webhooks');
const backupRoutes       = require('./backup');

const router = Router();

router.use('/auth',          authRoutes);
router.use('/health',        healthRoutes);
router.use('/customers',     customerRoutes);
router.use('/msl',           mslRoutes);
router.use('/forecasts',     forecastRoutes);
router.use('/deliveries',    deliveryRoutes);
router.use('/settings',      settingsRoutes);
router.use('/reminders',     reminderRoutes);
router.use('/notifications', notificationRoutes);
router.use('/webhooks',      webhookRoutes);
router.use('/backup',        backupRoutes);

module.exports = router;

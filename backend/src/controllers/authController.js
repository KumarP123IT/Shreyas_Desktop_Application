/**
 * Auth controller – /api/auth/*
 */

const { z } = require('zod');
const authService = require('../services/authService');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const config = require('../config');

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

const login = [
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);

    const maxAge =
      req.body.rememberMe
        ? 30 * 24 * 60 * 60 * 1000  // 30 days
        : 8 * 60 * 60 * 1000;        // 8 hours

    res.cookie(config.jwt.cookieName, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge,
      path: '/',
    });

    success(res, {
      user: result.user,
      expiresIn: result.expiresIn,
    });
  }),
];

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(config.jwt.cookieName, { path: '/' });
  success(res, { message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  success(res, user);
});

const updateProfile = [
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.updateProfile(req.user.id, req.body);
    success(res, user);
  }),
];

const changePassword = [
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.user.id, req.body);
    success(res, { message: 'Password changed successfully' });
  }),
];

module.exports = { login, logout, me, updateProfile, changePassword };

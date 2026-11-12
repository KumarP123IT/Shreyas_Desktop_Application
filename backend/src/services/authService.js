/**
 * Auth service – login, logout, refresh, change password.
 * Account lockout: 5 failed attempts → 15-minute lockout.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const config = require('../config');
const logger = require('../config/logger');
const {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} = require('../utils/errors');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Attempt login. Returns a signed JWT string on success.
 * Throws UnauthorizedError / ForbiddenError on failure.
 */
async function login({ usernameOrEmail, password, rememberMe = false }) {
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: usernameOrEmail },
        { email: usernameOrEmail },
      ],
    },
  });

  if (!user) throw new UnauthorizedError('Invalid username or password');

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil(
      (user.lockedUntil - new Date()) / 60_000
    );
    throw new ForbiddenError(
      `Account locked. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    const newCount = (user.failedAttempts || 0) + 1;
    const lockData =
      newCount >= MAX_ATTEMPTS
        ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
        : {};
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: newCount, ...lockData },
    });
    if (newCount >= MAX_ATTEMPTS) {
      throw new ForbiddenError(
        `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`
      );
    }
    throw new UnauthorizedError('Invalid username or password');
  }

  // Reset failed attempts
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  const expiresIn = rememberMe ? config.jwt.rememberExpiresIn : config.jwt.expiresIn;
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    config.jwt.secret,
    { expiresIn }
  );

  logger.info({ userId: user.id }, 'User logged in');

  return {
    token,
    expiresIn,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword ?? false,
    },
  };
}

/**
 * Change password for authenticated user.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError('Current password is incorrect');

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, mustChangePassword: false },
  });

  // The generated admin password is no longer valid — remove the credentials
  // file so it doesn't sit on disk (especially on installed/client machines).
  // Check both the configured storage root and the seed's default location.
  for (const p of new Set([
    path.join(config.storage.root, 'initial-admin-credentials.txt'),
    path.resolve(__dirname, '..', '..', 'storage', 'initial-admin-credentials.txt'),
  ])) {
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
        logger.info({ path: p }, 'Initial admin credentials file removed');
      }
    } catch (e) {
      logger.warn({ err: e, path: p }, 'Could not remove initial admin credentials file');
    }
  }

  logger.info({ userId }, 'Password changed');
}

/**
 * Get user profile.
 */
async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, displayName: true, mustChangePassword: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}

/**
 * Update display name / email for authenticated user.
 * Passing undefined for a field leaves it unchanged.
 * Passing an empty string is rejected by the Zod schema upstream.
 */
async function updateProfile(userId, data) {
  const allowed = {};
  if (data.displayName !== undefined) allowed.displayName = data.displayName;
  if (data.email !== undefined) allowed.email = data.email;

  const user = await prisma.user.update({
    where: { id: userId },
    data: allowed,
    select: { id: true, username: true, email: true, displayName: true, mustChangePassword: true },
  });
  return user;
}

module.exports = { login, changePassword, getProfile, updateProfile };

/**
 * JWT authentication middleware.
 * Reads token from httpOnly cookie OR Authorization: Bearer header.
 * Also enforces mustChangePassword: users flagged on first run can only
 * reach /auth/me, /auth/change-password and /auth/logout until they rotate
 * the temporary password.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const { UnauthorizedError, AppError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

// Routes a must-change-password user is still allowed to call
const PASSWORD_CHANGE_ALLOWED = new Set([
  'GET /auth/me',
  'POST /auth/change-password',
  'POST /auth/logout',
]);

const authenticate = asyncHandler(async (req, res, next) => {
  let token =
    req.cookies?.[config.jwt.cookieName] ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) throw new UnauthorizedError('Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError('Invalid or expired session');
  }

  // Load the flag from DB — JWT alone can't be trusted for this since the
  // flag can be cleared server-side without reissuing the token.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, deletedAt: true, mustChangePassword: true },
  });
  if (!user || user.deletedAt) throw new UnauthorizedError('Invalid or expired session');

  if (user.mustChangePassword) {
    // originalUrl looks like /api/auth/me → normalise to "GET /auth/me"
    const normalised = `${req.method} ${req.originalUrl.split('?')[0].replace(/^\/api/, '')}`;
    if (!PASSWORD_CHANGE_ALLOWED.has(normalised)) {
      throw new AppError(
        'You must change your password before continuing.',
        403,
        'PASSWORD_CHANGE_REQUIRED'
      );
    }
  }

  req.user = { id: user.id, username: user.username };
  next();
});

module.exports = { authenticate };

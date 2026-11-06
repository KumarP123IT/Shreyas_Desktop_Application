/**
 * JWT authentication middleware.
 * Reads token from httpOnly cookie OR Authorization: Bearer header.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  let token =
    req.cookies?.[config.jwt.cookieName] ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) throw new UnauthorizedError('Authentication required');

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired session');
  }
});

module.exports = { authenticate };

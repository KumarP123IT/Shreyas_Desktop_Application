/**
 * Consistent JSON response helpers.
 */

function success(res, data = null, statusCode = 200, meta = {}) {
  const body = { success: true, data };
  if (Object.keys(meta).length > 0) body.meta = meta;
  return res.status(statusCode).json(body);
}

function paginated(res, { data, total, page, pageSize }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

module.exports = { success, paginated };

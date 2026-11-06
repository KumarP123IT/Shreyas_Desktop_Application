/**
 * Parse page/pageSize from query params and return Prisma skip/take.
 */
function parsePagination(query, defaultPageSize = 20) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(query.pageSize || String(defaultPageSize), 10))
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

module.exports = { parsePagination };

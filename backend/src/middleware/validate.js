/**
 * Zod validation middleware factory.
 * Usage:  router.post('/', validate(MySchema), controller)
 */

const { ValidationError } = require('../utils/errors');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      return next(new ValidationError('Validation failed', details));
    }
    req[source] = result.data; // replace with parsed/transformed value
    next();
  };
}

module.exports = validate;

/**
 * Customer service – CRUD + audit logging.
 */

const customerRepo = require('../repositories/customerRepository');
const prisma = require('../config/prisma');
const { ConflictError, NotFoundError } = require('../utils/errors');

async function listCustomers(query) {
  return customerRepo.findAll(query);
}

async function getCustomer(id) {
  const customer = await customerRepo.findById(id);
  if (!customer) throw new NotFoundError('Customer');
  return customer;
}

async function createCustomer(data, userId) {
  // Block duplicate supplier codes
  const dupe = await customerRepo.findBySupplierCode(data.supplierCode);
  if (dupe) throw new ConflictError(`Supplier code "${data.supplierCode}" is already in use.`);

  const customer = await customerRepo.create(data);

  await _audit(userId, customer.id, 'customer', customer.id, 'CREATE', null, customer);
  return customer;
}

async function updateCustomer(id, data, userId) {
  const existing = await customerRepo.findById(id);
  if (!existing) throw new NotFoundError('Customer');

  if (data.supplierCode && data.supplierCode !== existing.supplierCode) {
    const dupe = await customerRepo.findBySupplierCode(data.supplierCode, id);
    if (dupe) throw new ConflictError(`Supplier code "${data.supplierCode}" is already in use.`);
  }

  const updated = await customerRepo.update(id, data);
  await _audit(userId, id, 'customer', id, 'UPDATE', existing, updated);
  return updated;
}

async function archiveCustomer(id, userId) {
  const existing = await customerRepo.findById(id);
  if (!existing) throw new NotFoundError('Customer');
  await customerRepo.softDelete(id);
  await _audit(userId, id, 'customer', id, 'ARCHIVE', existing, null);
}

async function restoreCustomer(id, userId) {
  const customer = await prisma.customer.findFirst({ where: { id } });
  if (!customer) throw new NotFoundError('Customer');
  await customerRepo.restore(id);
  await _audit(userId, id, 'customer', id, 'RESTORE', null, null);
}

// ── Private ───────────────────────────────────────────────────────────────────

async function _audit(userId, customerId, entityType, entityId, action, before, after) {
  await prisma.auditLog.create({
    data: { userId, customerId, entityType, entityId, action, before, after },
  });
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, archiveCustomer, restoreCustomer };

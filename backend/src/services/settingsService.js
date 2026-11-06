const settingsRepo = require('../repositories/settingsRepository');

async function getPublic() {
  return settingsRepo.getAll(); // secrets shown as [encrypted]
}

async function getDecrypted() {
  return settingsRepo.getAllDecrypted();
}

async function update(pairs) {
  await settingsRepo.setMany(pairs);
  return settingsRepo.getAll();
}

async function get(key) {
  return settingsRepo.get(key);
}

module.exports = { getPublic, getDecrypted, update, get };

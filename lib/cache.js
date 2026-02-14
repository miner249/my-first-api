const cacheStore = new Map();

function getMidnightKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function getCached(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }

  if (entry.dayKey && entry.dayKey !== getMidnightKey()) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(key, value, options = {}) {
  const { ttlMs, daily = false } = options;
  const entry = { value };

  if (ttlMs) {
    entry.expiresAt = Date.now() + ttlMs;
  }

  if (daily) {
    entry.dayKey = getMidnightKey();
  }

  cacheStore.set(key, entry);
  return value;
}

module.exports = {
  getCached,
  setCached,
  getMidnightKey,
};

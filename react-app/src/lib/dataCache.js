const valueCache = new Map();
const inflightCache = new Map();

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function getCachedValue(key, ttlMs) {
  const entry = valueCache.get(key);
  if (!entry) return undefined;
  if (ttlMs > 0 && Date.now() - entry.createdAt > ttlMs) {
    valueCache.delete(key);
    return undefined;
  }
  return cloneValue(entry.value);
}

export function setCachedValue(key, value) {
  valueCache.set(key, { value: cloneValue(value), createdAt: Date.now() });
}

export function getInflightValue(key) {
  return inflightCache.get(key);
}

export function setInflightValue(key, promise) {
  inflightCache.set(key, promise);
}

export function clearInflightValue(key) {
  inflightCache.delete(key);
}

export function clearDataCache() {
  valueCache.clear();
  inflightCache.clear();
}

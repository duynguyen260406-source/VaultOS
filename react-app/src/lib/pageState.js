const PAGE_STATE_PREFIX = 'vaultos_page_state:';
const memoryState = new Map();

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function getPageState(key, fallback) {
  if (memoryState.has(key)) return cloneValue(memoryState.get(key));

  try {
    const raw = sessionStorage.getItem(PAGE_STATE_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    memoryState.set(key, parsed);
    return cloneValue(parsed);
  } catch {
    return fallback;
  }
}

export function setPageState(key, value) {
  const stored = cloneValue(value);
  memoryState.set(key, stored);
  try {
    sessionStorage.setItem(PAGE_STATE_PREFIX + key, JSON.stringify(stored));
  } catch {}
}

export function clearAllPageState() {
  memoryState.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PAGE_STATE_PREFIX)) keys.push(key);
    }
    keys.forEach(key => sessionStorage.removeItem(key));
  } catch {}
}

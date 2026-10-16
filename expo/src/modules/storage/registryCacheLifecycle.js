// Serializes registry replacement and logout cleanup without blocking the
// unrelated household/form caches. Session generation invalidation makes a
// late pull fail closed before it can commit rows for an older account.
let registrySessionGeneration = 0;
let registrySessionController = new AbortController();
let registryQueue = Promise.resolve();

export function invalidateRegistrySession() {
  registrySessionGeneration += 1;
  registrySessionController.abort();
  registrySessionController = new AbortController();
  return registrySessionGeneration;
}

export function getRegistrySessionSignal() {
  return registrySessionController.signal;
}

export function getRegistrySessionGeneration() {
  return registrySessionGeneration;
}

export async function withRegistryCacheLock(work) {
  let release;
  const turn = new Promise((resolve) => { release = resolve; });
  const previous = registryQueue;
  registryQueue = turn;
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

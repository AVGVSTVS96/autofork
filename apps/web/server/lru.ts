export const keep = <K, V>(cache: Map<K, V>, key: K, value: V, size: number) => {
  cache.delete(key);
  cache.set(key, value);
  const oldest = cache.keys().next();

  if (cache.size > size && oldest.done !== true) {
    cache.delete(oldest.value);
  }
};

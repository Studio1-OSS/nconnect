class TTLCache:
    """A small cache with a size limit and per-entry expiry.

    TTLCache(max_size, ttl, clock) where clock() returns the current time in seconds.

    - set(key, value): store the value; it expires `ttl` seconds after this call.
      Setting an existing key replaces the value and restarts its expiry.
    - get(key, default=None): return the value, or default if missing or expired.
      A successful get makes the key the most recently used.
    - When a set would exceed max_size, expired entries are dropped first; if it is
      still full, the least recently used entry is evicted.
    - len(cache) counts only entries that have not expired.
    - `key in cache` is True only for entries that have not expired, and does not
      change which entry is least recently used.
    """

    def __init__(self, max_size, ttl, clock):
        raise NotImplementedError

from collections import OrderedDict

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
        self.max_size, self.ttl, self.clock = max_size, ttl, clock
        self._data = OrderedDict()

    def _alive(self, key):
        item = self._data.get(key)
        return item is not None and item[1] > self.clock()

    def _purge(self):
        now = self.clock()
        for key in [k for k, (_, exp) in self._data.items() if exp <= now]:
            del self._data[key]

    def set(self, key, value):
        if key in self._data:
            del self._data[key]
        else:
            if len(self._data) >= self.max_size:
                self._purge()
            if len(self._data) >= self.max_size:
                self._data.popitem(last=False)
        self._data[key] = (value, self.clock() + self.ttl)

    def get(self, key, default=None):
        if not self._alive(key):
            self._data.pop(key, None)
            return default
        self._data.move_to_end(key)
        return self._data[key][0]

    def __len__(self):
        self._purge()
        return len(self._data)

    def __contains__(self, key):
        return self._alive(key)

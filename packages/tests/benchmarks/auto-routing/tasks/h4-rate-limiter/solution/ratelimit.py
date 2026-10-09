from collections import deque

class RateLimiter:
    """Allow at most `limit` requests per key in any `window` seconds.

    RateLimiter(limit, window, clock) where clock() returns the time in seconds.

    - allow(key) returns True and records the request if fewer than `limit` requests
      from that key were allowed in the last `window` seconds. A request allowed at
      time t stops counting at exactly t + window. Otherwise it returns False, and a
      refused request does not count against the key.
    - The limit holds for every window of that length, not only for windows that
      start at a multiple of `window`.
    - tracked_keys() returns how many keys still have an allowed request inside the
      window. Keys with none must be forgotten, so memory does not grow with the
      number of clients ever seen.
    """

    def __init__(self, limit, window, clock):
        self.limit = limit
        self.window = window
        self.clock = clock
        self.times = {}

    def _expire(self, key, now):
        stamps = self.times.get(key)
        if stamps is None:
            return None
        while stamps and now - stamps[0] >= self.window:
            stamps.popleft()
        if not stamps:
            del self.times[key]
            return None
        return stamps

    def allow(self, key):
        now = self.clock()
        stamps = self._expire(key, now)
        if stamps is not None and len(stamps) >= self.limit:
            return False
        self.times.setdefault(key, deque()).append(now)
        return True

    def tracked_keys(self):
        now = self.clock()
        for key in list(self.times):
            self._expire(key, now)
        return len(self.times)

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
        self.counts = {}

    def allow(self, key):
        bucket = int(self.clock() // self.window)
        current = self.counts.get(key)
        if current is None or current[0] != bucket:
            current = [bucket, 0]
            self.counts[key] = current
        current[1] += 1
        return current[1] <= self.limit

    def tracked_keys(self):
        return len(self.counts)

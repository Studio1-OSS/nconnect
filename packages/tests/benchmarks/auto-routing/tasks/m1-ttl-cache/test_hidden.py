import unittest
from cache import TTLCache
class Clock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
class T(unittest.TestCase):
    def setUp(self):
        self.clock = Clock(); self.c = TTLCache(2, 10, self.clock)
    def test_get_set(self):
        self.c.set("a", 1); self.assertEqual(self.c.get("a"), 1); self.assertEqual(self.c.get("x", "d"), "d")
    def test_expiry(self):
        self.c.set("a", 1); self.clock.t = 9.9; self.assertEqual(self.c.get("a"), 1)
        self.clock.t = 10; self.assertIsNone(self.c.get("a")); self.assertEqual(len(self.c), 0)
    def test_lru_eviction(self):
        self.c.set("a", 1); self.c.set("b", 2); self.c.get("a"); self.c.set("c", 3)
        self.assertIsNone(self.c.get("b")); self.assertEqual(self.c.get("a"), 1); self.assertEqual(self.c.get("c"), 3)
    def test_set_existing_restarts_expiry_and_no_evict(self):
        self.c.set("a", 1); self.c.set("b", 2); self.clock.t = 5; self.c.set("a", 9)
        self.assertEqual(len(self.c), 2); self.clock.t = 12
        self.assertEqual(self.c.get("a"), 9); self.assertIsNone(self.c.get("b"))
    def test_expired_dropped_before_evicting(self):
        self.c.set("a", 1); self.clock.t = 6; self.c.set("b", 2); self.clock.t = 11
        self.c.set("c", 3)  # "a" expired: it goes, "b" stays
        self.assertEqual(self.c.get("b"), 2); self.assertEqual(self.c.get("c"), 3)
    def test_contains_does_not_touch_recency(self):
        self.c.set("a", 1); self.c.set("b", 2)
        self.assertTrue("a" in self.c); self.c.set("c", 3)
        self.assertFalse("a" in self.c); self.assertTrue("b" in self.c)
    def test_len_ignores_expired(self):
        self.c.set("a", 1); self.clock.t = 5; self.c.set("b", 2); self.clock.t = 10
        self.assertEqual(len(self.c), 1)
if __name__ == "__main__": unittest.main()

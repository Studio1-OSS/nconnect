import unittest
from ratelimit import RateLimiter
class Clock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
class T(unittest.TestCase):
    def setUp(self):
        self.clock = Clock(); self.r = RateLimiter(3, 10, self.clock)
    def test_basic(self):
        self.assertEqual([self.r.allow("a") for _ in range(4)], [True, True, True, False])
        self.assertTrue(self.r.allow("b"))
    def test_boundary_burst(self):
        self.clock.t = 9
        self.assertTrue(all(self.r.allow("a") for _ in range(3)))
        self.clock.t = 10.5  # a new fixed window, but the same sliding one
        self.assertFalse(self.r.allow("a"))
        self.clock.t = 18.9
        self.assertFalse(self.r.allow("a"))
    def test_slides(self):
        for t in (0, 4, 8): self.clock.t = t; self.assertTrue(self.r.allow("a"))
        self.clock.t = 9.9; self.assertFalse(self.r.allow("a"))
        self.clock.t = 10; self.assertTrue(self.r.allow("a"))  # the one from t=0 expired exactly now
        self.assertFalse(self.r.allow("a"))
        self.clock.t = 14; self.assertTrue(self.r.allow("a"))
    def test_refused_requests_do_not_count(self):
        for _ in range(3): self.r.allow("a")
        for t in range(1, 10): self.clock.t = t; self.assertFalse(self.r.allow("a"))
        self.clock.t = 10; self.assertTrue(self.r.allow("a"))
    def test_forgets_idle_keys(self):
        for i in range(1000): self.r.allow(f"client-{i}")
        self.assertEqual(self.r.tracked_keys(), 1000)
        self.clock.t = 5; self.r.allow("late")
        self.clock.t = 10; self.assertEqual(self.r.tracked_keys(), 1)
        self.clock.t = 15; self.assertEqual(self.r.tracked_keys(), 0)
    def test_storage_does_not_grow(self):
        for i in range(2000):
            self.clock.t = i * 20; self.r.allow(f"c{i}")
        self.assertLessEqual(self.r.tracked_keys(), 1)
        sizes = [len(v) for v in vars(self.r).values() if isinstance(v, dict)]
        self.assertTrue(all(size <= 2 for size in sizes), sizes)
if __name__ == "__main__": unittest.main()

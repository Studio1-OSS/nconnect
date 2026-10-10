import unittest
from calendar_util import free_slots as f
D = (540, 1020)  # 09:00 to 17:00
class T(unittest.TestCase):
    def test_empty_day(self): self.assertEqual(f([], *D), [(540, 1020)])
    def test_simple(self): self.assertEqual(f([(600, 660), (720, 780)], *D), [(540, 600), (660, 720), (780, 1020)])
    def test_unsorted_and_overlap(self): self.assertEqual(f([(700, 800), (600, 720)], *D), [(540, 600), (800, 1020)])
    def test_contained(self): self.assertEqual(f([(600, 900), (650, 700)], *D), [(540, 600), (900, 1020)])
    def test_touching(self): self.assertEqual(f([(600, 660), (660, 720)], *D), [(540, 600), (720, 1020)])
    def test_outside_hours(self):
        self.assertEqual(f([(480, 600), (960, 1100)], *D), [(600, 960)])
        self.assertEqual(f([(100, 200), (1100, 1200)], *D), [(540, 1020)])
        self.assertEqual(f([(0, 2000)], *D), [])
    def test_min_minutes_is_inclusive(self):
        self.assertEqual(f([(570, 1020)], *D, min_minutes=30), [(540, 570)])
        self.assertEqual(f([(569, 1020)], *D, min_minutes=30), [])
        self.assertEqual(f([(600, 660), (690, 1020)], *D, min_minutes=60), [(540, 600)])
    def test_ignores_empty_meetings(self): self.assertEqual(f([(700, 700), (800, 750)], *D), [(540, 1020)])
    def test_meeting_at_edges(self): self.assertEqual(f([(540, 600), (960, 1020)], *D), [(600, 960)])
if __name__ == "__main__": unittest.main()

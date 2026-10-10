import unittest
from durations import parse_duration as p
class T(unittest.TestCase):
    def test_simple(self):
        self.assertEqual(p("45s"), 45); self.assertEqual(p("1h30m"), 5400); self.assertEqual(p("2d 4h"), 187200)
    def test_types(self):
        self.assertIsInstance(p("1.5h"), int); self.assertEqual(p("1.5h"), 5400)
        self.assertIsInstance(p("0.5s"), float); self.assertEqual(p("0.5s"), 0.5)
    def test_case_and_space(self):
        self.assertEqual(p(" 1H 30M "), 5400); self.assertEqual(p("1 h"), 3600)
    def test_invalid(self):
        for bad in ["", "   ", "10", "1x", "h", "1h1h", "30m1h", "1h 30", "abc", "-1h", "1h,30m"]:
            with self.assertRaises(ValueError, msg=bad): p(bad)
if __name__ == "__main__": unittest.main()

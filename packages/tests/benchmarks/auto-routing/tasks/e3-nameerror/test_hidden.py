import unittest, stats
class T(unittest.TestCase):
    def test_mean(self): self.assertEqual(stats.mean([1, 2, 3]), 2)
    def test_float(self): self.assertAlmostEqual(stats.mean([1, 2]), 1.5)
    def test_empty(self):
        with self.assertRaises(ValueError): stats.mean([])
    def test_spread(self): self.assertEqual(stats.spread([4, 9, 1]), 8)
if __name__ == "__main__": unittest.main()

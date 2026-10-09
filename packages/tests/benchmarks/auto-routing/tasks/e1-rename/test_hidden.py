import unittest, shapes, report
class T(unittest.TestCase):
    def test_renamed(self):
        self.assertTrue(hasattr(shapes, "rectangle_area"))
        self.assertFalse(hasattr(shapes, "calc_area"))
        self.assertEqual(shapes.rectangle_area(3, 4), 12)
    def test_callers(self):
        self.assertEqual(report.total_area([(2, 3), (4, 5)]), 26)
if __name__ == "__main__": unittest.main()

import unittest, textutil
class T(unittest.TestCase):
    def test_basic(self): self.assertEqual(textutil.slugify("Hello World"), "hello-world")
    def test_runs(self): self.assertEqual(textutil.slugify("  Rock & Roll -- 2024!  "), "rock-roll-2024")
    def test_empty(self): self.assertEqual(textutil.slugify("!!!"), "")
    def test_digits(self): self.assertEqual(textutil.slugify("v2.0_final"), "v2-0-final")
if __name__ == "__main__": unittest.main()

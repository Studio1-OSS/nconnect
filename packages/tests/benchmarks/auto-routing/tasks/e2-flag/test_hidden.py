import unittest, cli
class T(unittest.TestCase):
    def test_default(self): self.assertEqual(cli.main(["--name", "bob"]), "Hello, bob!")
    def test_upper(self): self.assertEqual(cli.main(["--name", "bob", "--upper"]), "HELLO, BOB!")
    def test_upper_default_name(self): self.assertEqual(cli.main(["--upper"]), "HELLO, WORLD!")
if __name__ == "__main__": unittest.main()

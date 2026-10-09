import json, unittest
from convert import convert
def rows(text): return [json.loads(line) for line in convert(text).split("\n")] if convert(text) else []
class T(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(rows("name,age\nann,30\nbob,41"), [{"name": "ann", "age": 30}, {"name": "bob", "age": 41}])
    def test_types(self):
        r = rows("a,b,c,d\n1.5,,x,-3")[0]
        self.assertEqual(r, {"a": 1.5, "b": None, "c": "x", "d": -3}); self.assertIsInstance(r["d"], int)
    def test_not_numbers(self):
        self.assertEqual(rows("a,b,c\n007x,1.2.3,1e5x")[0], {"a": "007x", "b": "1.2.3", "c": "1e5x"})
    def test_quoted(self):
        self.assertEqual(rows('name,note\n"Smith, J","line1\nline2"')[0], {"name": "Smith, J", "note": "line1\nline2"})
    def test_header_trim_and_blank_lines(self):
        self.assertEqual(rows(" name , age \n\nann,30\n\n"), [{"name": "ann", "age": 30}])
    def test_no_trailing_newline(self):
        self.assertFalse(convert("a\n1").endswith("\n")); self.assertEqual(convert("a,b"), "")
if __name__ == "__main__": unittest.main()

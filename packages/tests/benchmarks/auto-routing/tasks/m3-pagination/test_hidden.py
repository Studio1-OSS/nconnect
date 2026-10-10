import unittest, users
class T(unittest.TestCase):
    def walk(self, limit):
        seen, cursor, pages = [], None, 0
        while True:
            page = users.list_users(limit=limit, cursor=cursor)
            self.assertLessEqual(len(page["items"]), limit)
            seen += [u["id"] for u in page["items"]]; pages += 1
            cursor = page["next_cursor"]
            if cursor is None: break
            self.assertIsInstance(cursor, str); self.assertLess(pages, 50)
        return seen
    def test_all_pages(self):
        want = sorted(u["id"] for u in users.USERS)
        for limit in (1, 3, 4, 11, 100): self.assertEqual(self.walk(limit), want, limit)
    def test_default(self):
        page = users.list_users()
        self.assertEqual(len(page["items"]), 11); self.assertIsNone(page["next_cursor"])
    def test_exact_fit_has_no_next(self):
        self.assertIsNone(users.list_users(limit=11)["next_cursor"])
    def test_bad_input(self):
        for limit in (0, 101, -1):
            with self.assertRaises(ValueError): users.list_users(limit=limit)
        with self.assertRaises(ValueError): users.list_users(cursor="not-a-cursor!!")
if __name__ == "__main__": unittest.main()

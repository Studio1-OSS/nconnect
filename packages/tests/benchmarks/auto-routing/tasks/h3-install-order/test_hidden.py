import unittest
from resolver import CycleError, MissingDependency, resolve
def valid(packages, order):
    pos = {name: i for i, name in enumerate(order)}
    return sorted(order) == sorted(packages) and all(pos[d] < pos[n] for n, deps in packages.items() for d in deps)
class T(unittest.TestCase):
    def test_chain(self): self.assertEqual(resolve({"app": ["lib"], "lib": ["core"], "core": []}), ["core", "lib", "app"])
    def test_diamond(self):
        p = {"app": ["a", "b"], "a": ["core"], "b": ["core"], "core": []}
        self.assertEqual(resolve(p), ["core", "a", "b", "app"])
    def test_shared_dep_listed_late(self):
        p = {"z": [], "a": ["z", "m"], "m": ["z"], "b": ["a"]}
        order = resolve(p); self.assertTrue(valid(p, order), order); self.assertEqual(order, ["z", "m", "a", "b"])
    def test_alphabetical_when_free(self):
        self.assertEqual(resolve({"c": [], "a": [], "b": []}), ["a", "b", "c"])
        self.assertEqual(resolve({"x": ["b"], "b": [], "a": ["x"], "c": []}), ["b", "c", "x", "a"])
    def test_missing(self):
        with self.assertRaises(MissingDependency) as ctx: resolve({"a": ["ghost"]})
        self.assertEqual(ctx.exception.args[0], "ghost")
    def test_cycle(self):
        with self.assertRaises(CycleError) as ctx: resolve({"b": ["c"], "c": ["a"], "a": ["b"], "free": []})
        self.assertEqual(ctx.exception.cycle, ["a", "b", "c"])
    def test_self_cycle(self):
        with self.assertRaises(CycleError) as ctx: resolve({"a": ["a"]})
        self.assertEqual(ctx.exception.cycle, ["a"])
    def test_cycle_behind_valid_packages(self):
        with self.assertRaises(CycleError) as ctx: resolve({"ok": [], "top": ["x"], "x": ["y"], "y": ["x"]})
        self.assertEqual(ctx.exception.cycle, ["x", "y"])
    def test_deep_graph(self):
        p = {f"p{i:05d}": ([f"p{i-1:05d}"] if i else []) for i in range(5000)}
        order = resolve(p); self.assertEqual(order[0], "p00000"); self.assertEqual(len(order), 5000)
if __name__ == "__main__": unittest.main()

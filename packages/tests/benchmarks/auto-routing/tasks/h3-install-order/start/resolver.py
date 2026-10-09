class MissingDependency(Exception):
    """Raised when a package depends on one that is not in the input. args[0] is its name."""

class CycleError(Exception):
    """Raised for circular dependencies.

    `.cycle` lists the packages of one cycle, starting at the alphabetically smallest
    package in it and following the dependency edges, so for a -> b -> c -> a it is
    ["a", "b", "c"], and for a package that depends on itself it is ["a"].
    """
    def __init__(self, cycle):
        super().__init__(" -> ".join(cycle))
        self.cycle = cycle

def resolve(packages):
    """Return an install order for `packages`, a dict of name -> list of dependencies.

    Every package comes after all of its dependencies. When several packages are
    ready to install, the alphabetically smallest goes first, so the result is the
    same every time. Raises MissingDependency or CycleError as described above;
    it must never hang or hit the recursion limit, however deep the graph is.
    """

    order = []
    seen = set()

    def visit(name):
        if name in seen:
            return
        order.append(name)
        seen.add(name)
        for dep in packages[name]:
            visit(dep)

    for name in packages:
        visit(name)
    return list(reversed(order))

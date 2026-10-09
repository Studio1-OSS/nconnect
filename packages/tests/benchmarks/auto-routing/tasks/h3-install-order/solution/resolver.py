import heapq

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

    for name, deps in packages.items():
        for dep in deps:
            if dep not in packages:
                raise MissingDependency(dep)
    waiting = {name: len(set(deps)) for name, deps in packages.items()}
    dependents = {name: [] for name in packages}
    for name, deps in packages.items():
        for dep in set(deps):
            dependents[dep].append(name)
    ready = [name for name, count in waiting.items() if count == 0]
    heapq.heapify(ready)
    order = []
    while ready:
        name = heapq.heappop(ready)
        order.append(name)
        for other in dependents[name]:
            waiting[other] -= 1
            if waiting[other] == 0:
                heapq.heappush(ready, other)
    if len(order) == len(packages):
        return order
    stuck = {name for name in packages if name not in order}
    path, index, node = [], {}, min(stuck)
    while node not in index:
        index[node] = len(path)
        path.append(node)
        node = min(dep for dep in packages[node] if dep in stuck)
    cycle = path[index[node]:]
    start = cycle.index(min(cycle))
    raise CycleError(cycle[start:] + cycle[:start])

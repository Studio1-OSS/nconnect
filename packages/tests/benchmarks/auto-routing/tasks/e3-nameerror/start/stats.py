def mean(values):
    if not values:
        raise ValueError("mean of empty list")
    total = 0
    for value in values:
        total += value
    return totl / len(values)

def spread(values):
    return max(values) - min(values)

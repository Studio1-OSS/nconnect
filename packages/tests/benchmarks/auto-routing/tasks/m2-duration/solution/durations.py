import re

def parse_duration(text):
    """Parse a duration such as "1h30m" into a number of seconds.

    Units: d (days), h (hours), m (minutes), s (seconds). Case does not matter.
    Parts may be separated by spaces ("2d 4h"), a space may sit between a number and
    its unit ("1 h"), and numbers may be decimals ("1.5h").
    Parts must go from the largest unit to the smallest and a unit may appear once.
    The result is an int when it is a whole number of seconds, otherwise a float.
    Raise ValueError for anything else: an empty string, a number with no unit,
    an unknown unit, a repeated unit, or units out of order.
    """

    units = {"d": 86400, "h": 3600, "m": 60, "s": 1}
    order = "dhms"
    compact = text.strip().lower()
    if not compact or not re.fullmatch(r"(?:\s*\d+(?:\.\d+)?\s*[a-z]+)+", compact):
        raise ValueError(f"bad duration: {text!r}")
    total, last = 0.0, -1
    for number, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([a-z]+)", compact):
        if unit not in units or order.index(unit) <= last:
            raise ValueError(f"bad duration: {text!r}")
        last = order.index(unit)
        total += float(number) * units[unit]
    return int(total) if total == int(total) else total

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
    raise NotImplementedError

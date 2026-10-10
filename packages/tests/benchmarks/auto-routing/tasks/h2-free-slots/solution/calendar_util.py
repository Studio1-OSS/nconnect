def free_slots(meetings, day_start, day_end, min_minutes=1):
    """Return the free intervals in a working day.

    Times are minutes since midnight. `meetings` is a list of (start, end) pairs in
    any order; they may overlap, touch, sit inside one another, or run outside the
    working day. A meeting with end <= start is ignored.

    The result is a sorted list of (start, end) pairs inside [day_start, day_end]
    during which no meeting is running, each at least `min_minutes` long. Meetings
    that touch (one ends when the next starts) leave no free time between them.
    """

    slots = []
    cursor = day_start
    for start, end in sorted(m for m in meetings if m[1] > m[0]):
        start, end = max(start, day_start), min(end, day_end)
        if end <= start:
            continue
        if start - cursor >= min_minutes and start > cursor:
            slots.append((cursor, start))
        cursor = max(cursor, end)
    if day_end - cursor >= min_minutes and day_end > cursor:
        slots.append((cursor, day_end))
    return slots

from shapes import rectangle_area

def total_area(rooms):
    return sum(rectangle_area(w, h) for w, h in rooms)

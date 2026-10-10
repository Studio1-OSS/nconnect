from shapes import calc_area

def total_area(rooms):
    return sum(calc_area(w, h) for w, h in rooms)

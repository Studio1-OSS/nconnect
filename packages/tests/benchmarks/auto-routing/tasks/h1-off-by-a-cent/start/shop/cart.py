from .discounts import apply_discount
from .tax import add_tax

def checkout(lines, discount_percent=0, tax_rate="0"):
    subtotal = 0.0
    for price, quantity in lines:
        subtotal += float(price) * quantity
    subtotal = apply_discount(subtotal, discount_percent)
    total = add_tax(subtotal, tax_rate)
    return f"{total:.2f}"

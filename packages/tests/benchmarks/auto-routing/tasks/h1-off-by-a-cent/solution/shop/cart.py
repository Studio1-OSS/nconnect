from decimal import Decimal

from .discounts import apply_discount
from .tax import add_tax

def checkout(lines, discount_percent=0, tax_rate="0"):
    subtotal = Decimal("0")
    for price, quantity in lines:
        subtotal += apply_discount(Decimal(str(price)) * quantity, discount_percent)
    total = add_tax(subtotal, tax_rate)
    return f"{total:.2f}"

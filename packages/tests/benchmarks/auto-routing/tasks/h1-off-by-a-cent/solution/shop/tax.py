from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

def add_tax(amount, rate):
    return amount + (amount * Decimal(str(rate))).quantize(CENT, rounding=ROUND_HALF_UP)

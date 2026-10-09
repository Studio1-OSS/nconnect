from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

def apply_discount(amount, percent):
    factor = (Decimal("100") - Decimal(str(percent))) / Decimal("100")
    return (amount * factor).quantize(CENT, rounding=ROUND_HALF_UP)

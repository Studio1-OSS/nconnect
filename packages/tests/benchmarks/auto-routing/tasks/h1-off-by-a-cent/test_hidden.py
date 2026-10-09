import unittest
from decimal import ROUND_HALF_UP, Decimal
from shop import checkout
CENT = Decimal("0.01")
def expected(lines, pct, rate):
    sub = Decimal("0")
    for price, qty in lines:
        sub += (Decimal(price) * qty * (Decimal(100) - Decimal(str(pct))) / Decimal(100)).quantize(CENT, rounding=ROUND_HALF_UP)
    return f"{sub + (sub * Decimal(rate)).quantize(CENT, rounding=ROUND_HALF_UP):.2f}"
CASES = [
    ([("19.99", 1)], 0, "0"),
    ([("0.99", 1), ("0.99", 1), ("0.99", 1)], 15, "0"),
    ([("10.05", 1)], 50, "0"),
    ([("1.15", 1), ("2.25", 1), ("3.35", 1)], 10, "0"),
    ([("33.33", 3), ("0.07", 9)], "12.5", "0.0825"),
    ([("4.35", 1)], 0, "0.10"),
    ([("19.99", 2), ("5.49", 3), ("0.35", 7)], 15, "0.0725"),
    ([("1.005", 1)], 0, "0"),
    ([("2.675", 2), ("0.125", 3)], 20, "0.2"),
]
class T(unittest.TestCase):
    def test_cases(self):
        for lines, pct, rate in CASES:
            self.assertEqual(checkout(lines, pct, rate), expected(lines, pct, rate), (lines, pct, rate))
    def test_known_values(self):
        self.assertEqual(checkout([("0.99", 1), ("0.99", 1), ("0.99", 1)], 15, "0"), "2.52")
        self.assertEqual(checkout([("10.05", 1)], 50, "0"), "5.03")
        self.assertEqual(checkout([("4.35", 1)], 0, "0.10"), "4.79")
if __name__ == "__main__": unittest.main()

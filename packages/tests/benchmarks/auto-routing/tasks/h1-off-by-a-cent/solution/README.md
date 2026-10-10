# Pricing rules

Prices are strings in dollars, such as "19.99".

1. A line's total is its unit price times its quantity.
2. A percentage discount applies to each line separately. The discounted line is
   rounded to the nearest cent, with halves rounded up.
3. The subtotal is the sum of the discounted lines.
4. Tax is the subtotal times the tax rate, rounded to the nearest cent, halves up.
5. The total is subtotal plus tax, returned as a string with two decimals.

`checkout(lines, discount_percent, tax_rate)` takes lines as (price, quantity)
pairs, the discount as a number such as 15 or "12.5", and the rate as a string
such as "0.0825".

# Negative Total Clamping

When negative Items or global discount Adjustments reduce a Participant's calculated payable subtotal below zero, the final total for that Participant is clamped to exactly `0.00`. This prevents edge cases where a Participant would have a negative bill share and be owed money by the group. Global negative Adjustments are distributed proportionally based only on positive subtotals to avoid division by zero or negative ratio errors.

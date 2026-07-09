# Context: Splat Bill Splitter

This document defines the ubiquitous language and domain model for the Splat application.

## Glossary

### Core Domain

#### Bill
The overall transaction representing a single receipt. It is defined by a name, currency symbol, items list, participants list, and adjustments.

#### Item
A specific purchased product or service line on the bill. Each item has a name, unit price, and total quantity.

#### Participant
A person designated to pay for a share of the bill.

#### Adjustment
A global surcharge or discount (such as tax, tip, or service fee) applied to the bill. Adjustments are split among participants proportionally based on their allocation totals.

---

### Allocation & Quantity

#### Quantity
The total count of units purchased for a specific item.

#### Allocation
The assignment of specific quantities/shares of an item to a participant.

#### Assigned Quantity
The specific integer count of an item's units assigned to one participant.

#### Under-allocation
An invalid state where the sum of all participants' Assigned Quantities for a multi-quantity item is less than the item's total Quantity. This blocks the split calculation and requires user correction.

#### Negative Clamping
The restriction of a participant's final payable total to a minimum of 0.00. This prevents split models from generating negative final amounts where a participant would be owed money.

#### Penny-Rounding Correction
A deterministic adjustment applied to resolve fractional-cent discrepancy remainders resulting from even division of prices. The participant with the highest individual bill share receives the correction to minimize relative value distortion.

#### Display-Only Itemized Rounding
The policy of keeping item allocations as raw floating-point numbers during summation. Individual item shares are rounded to two decimal places for display purposes only in breakdown modals, preventing compounding rounding errors in the subtotal and grand total calculations.

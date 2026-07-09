# Display-Only Itemized Rounding Policy

To prevent compounding rounding errors across multiple split Items, the system aggregates allocations using raw floating-point numbers. Rounding to two decimal places is only performed when calculating individual participant subtotals and grand totals. Individual item allocation shares shown in itemized breakdown interfaces are rounded for visual representation only and are not used as inputs for subsequent summation.

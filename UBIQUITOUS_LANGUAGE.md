# Ubiquitous Language

## Bill & Core Split Domain

| Term            | Definition                                                                  | Aliases to avoid           |
| --------------- | --------------------------------------------------------------------------- | -------------------------- |
| **Bill**        | The overall transaction representing a receipt, containing items, adjustments, and participants. | Split, invoice, receipt    |
| **Item**        | A specific purchased product or service line on the bill, defined by name, total price, and quantity. | Row, line, scan            |
| **Participant** | A person designated to pay for a share of the bill.                        | Person, friend, user       |
| **Adjustment**  | A global surcharge (such as tax, tip, or service fee) applied to the bill.  | Tax, surcharge, fee        |

## Allocation & Quantity

| Term                  | Definition                                                                  | Aliases to avoid           |
| --------------------- | --------------------------------------------------------------------------- | -------------------------- |
| **Quantity**          | The total count of units purchased for a specific item.                    | Count, units               |
| **Allocation**        | The assignment of specific quantities/shares of an item to a participant.  | Assignment, share          |
| **Assigned Quantity** | The specific integer count of an item's units assigned to one participant.  | Portion, count             |

## Relationships

- A **Bill** has one or more **Items**, one or more **Participants**, and zero or more **Adjustments**.
- An **Item** has a total **Quantity**.
- A **Participant** receives an **Allocation** representing their **Assigned Quantity** for each **Item** they share.
- The sum of all **Assigned Quantities** for an **Item** must exactly equal its **Quantity**.

## Example dialogue

> **Dev:** "When a **Participant** is added to an **Item** with a **Quantity** greater than one, how do we record it?"
> **Domain expert:** "We record it as an **Allocation** with an **Assigned Quantity** showing how many units of that **Item** they consumed."
> **Dev:** "So if the **Item** has a **Quantity** of 3, but the sum of all **Assigned Quantities** is only 2, is that a valid **Bill**?"
> **Domain expert:** "No — we must enforce that the entire **Quantity** of the **Item** is fully allocated before finalizing the **Bill**."
> **Dev:** "And how do global **Adjustments** get split?"
> **Domain expert:** "Each **Participant** pays a share of the **Adjustments** proportional to the total cost of their **Allocations**."

## Flagged ambiguities

- "Split" was used to mean both the **Bill** itself and the act of allocating items — we use **Bill** for the document, and **Allocation** for assigning items to **Participants**.
- "Tax/Tip" were used interchangeably with **Adjustment** — we use **Adjustment** as the unified domain term for any global cost modifications.

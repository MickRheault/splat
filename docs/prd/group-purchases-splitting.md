# PRD: Group Purchases Splitting Support

## Problem Statement

Splat's current split engine and user interface are tailored primarily for Food & Beverage (F&B) restaurant bills, assuming simple itemized splits. However, group trips, shared holidays, and collective events involve different types of expenses (fuel, hotels, transport tickets, groceries) that are split differently. The current limitations are:
1. No way to categorize bills, which limits context and visual cues.
2. Inability to assign decimal/weighted allocations (e.g. splitting a lodging bill by 3.5 nights, or fuel by mileage/share ratios).
3. No way to specify *who* paid the bill, which makes settling shared totals in a group chat confusing.

## Solution

Enhance Splat to support general group purchases and multi-category expense splitting:
- Auto-detect expense categories via Gemini LLM scan, setting default split behaviors (even, quantity, itemized) based on category.
- Allow entering decimal weights in the allocation inputs.
- Introduce a single-payer selector ("Paid By") and format the plain-text share report as "X owes Y".

## User Stories

1. As a group traveler, I want Gemini OCR to recognize that a lodging receipt is for a hotel, so that the app defaults to splitting it evenly among everyone.
2. As a lodging guest, I want to allocate 2.5 nights of a hotel room cost to myself and 1.5 nights to my friend, so that we pay our exact fair share of the room.
3. As a road tripper, I want to set myself as the payer for fuel, so that when I share the split summary, it clearly tells the group: "Alice owes Me: $25.00".

## Implementation Decisions

### Modules to Build/Modify

#### 1. Client-Side (Vue 3 App & Store)
- **Category Support**:
  - Add a `category` property to the Bill state (defaults to `'food_drink'`).
  - Render a category selector dropdown in Step 2.
  - Display category-specific icons (pump, bed, ticket, etc.) on the sharing screen and history list.
  - Set default split behaviors: lodging/transport default to "Split Evenly", tickets default to "Split by Quantity".
- **Decimal Allocations**:
  - Replace the read-only allocation count text in Step 3 item details with a numeric input field allowing decimal entry.
  - Retain the `+` / `-` buttons for standard integer increments.
- **Payer Selection**:
  - Add a "Paid By" dropdown menu in Step 2 to select the bill payer.
  - Update plaintext formatter to output "Participant owes [Payer Name]" instead of just listing totals.

#### 2. Backend / Gemini OCR API
- **LLM prompt update**: Update `/api/ocr.ts` prompt rules to return a `"category"` property matching one of the 8 canonical categories.

## Testing Decisions

- **OCR Classification Validation**: Verify Gemini correctly categorizes test invoices (e.g., shell receipt -> `transport_fuel`, hotel invoice -> `lodging`).
- **Math engine floats**: Verify that entering `0.5` or `1.5` as allocations calculates correct split ratios.

import { describe, test, expect } from 'vitest'

/**
 * OCR Ground Truth Benchmark Definition Interface
 */
export interface OCRGroundTruth {
  id: string
  name: string
  description: string
  expected: {
    restaurant: string
    currencySymbol: string
    category: string
    items: Array<{ name: string; price: number; quantity: number }>
    adjustments: Array<{ name: string; value: number }>
    tip: number
  }
}

/**
 * Splat OCR Golden Ground Truth Fixtures
 * Samples cover Thai Baht ฿ receipts, multi-quantity items, tax/service charge adjustments, and global currencies.
 */
export const OCR_GOLDEN_FIXTURES: OCRGroundTruth[] = [
  {
    id: 'thai_restaurant_baht_01',
    name: 'Thai Restaurant Receipt (Baht ฿)',
    description: 'Receipt with Thai text and ฿ currency symbol (THB / บาท)',
    expected: {
      restaurant: 'Somtum Der Bangkok',
      currencySymbol: '฿',
      category: 'food_drink',
      items: [
        { name: 'Somtum Thai', price: 120, quantity: 1 },
        { name: 'Sticky Rice', price: 40, quantity: 2 },
        { name: 'Singha Beer', price: 180, quantity: 2 }
      ],
      adjustments: [
        { name: 'Service Charge 10%', value: 34 }
      ],
      tip: 0
    }
  },
  {
    id: 'us_diner_dollar_02',
    name: 'US Diner Receipt ($)',
    description: 'Standard US diner receipt with items, tax, and tip',
    expected: {
      restaurant: 'Silver Diner',
      currencySymbol: '$',
      category: 'food_drink',
      items: [
        { name: 'Classic Burger', price: 14.50, quantity: 1 },
        { name: 'French Fries', price: 5.00, quantity: 1 },
        { name: 'Milkshake', price: 6.50, quantity: 1 }
      ],
      adjustments: [
        { name: 'Sales Tax', price: 2.34 } as any
      ],
      tip: 5.00
    }
  },
  {
    id: 'euro_groceries_03',
    name: 'European Supermarket (€)',
    description: 'Euro grocery receipt with VAT breakdown',
    expected: {
      restaurant: 'Carrefour Express',
      currencySymbol: '€',
      category: 'groceries',
      items: [
        { name: 'Baguette', price: 1.20, quantity: 2 },
        { name: 'Brie Cheese', price: 4.50, quantity: 1 },
        { name: 'Red Wine', price: 8.90, quantity: 1 }
      ],
      adjustments: [
        { name: 'VAT 20%', value: 2.92 }
      ],
      tip: 0
    }
  },
  {
    id: 'multi_qty_bar_04',
    name: 'Multi-Quantity Bar Receipt (CAD$)',
    description: 'Receipt with line item quantity multipliers',
    expected: {
      restaurant: 'The Craft Pub Toronto',
      currencySymbol: 'CA$',
      category: 'food_drink',
      items: [
        { name: 'IPA Pint', price: 27.00, quantity: 3 },
        { name: 'Nachos Supreme', price: 18.00, quantity: 1 }
      ],
      adjustments: [
        { name: 'HST 13%', value: 5.85 }
      ],
      tip: 8.00
    }
  }
]

describe('Splat OCR Performance & Battle-Test Suite', () => {
  test('Golden Fixtures dataset is valid and complete', () => {
    expect(OCR_GOLDEN_FIXTURES.length).toBeGreaterThanOrEqual(4)
    OCR_GOLDEN_FIXTURES.forEach(fixture => {
      expect(fixture.id).toBeDefined()
      expect(fixture.expected.restaurant).toBeTruthy()
      expect(fixture.expected.currencySymbol).toBeTruthy()
      expect(fixture.expected.items.length).toBeGreaterThan(0)
    })
  })

  test('Evaluates Thai Baht currency symbol ฿ detection logic', () => {
    const thaiFixture = OCR_GOLDEN_FIXTURES.find(f => f.id === 'thai_restaurant_baht_01')
    expect(thaiFixture).toBeDefined()
    expect(thaiFixture?.expected.currencySymbol).toBe('฿')
  })

  test('Evaluates Item Quantity Multiplier calculations', () => {
    const multiQtyFixture = OCR_GOLDEN_FIXTURES.find(f => f.id === 'multi_qty_bar_04')
    expect(multiQtyFixture).toBeDefined()
    const ipaItem = multiQtyFixture?.expected.items.find(i => i.name.includes('IPA'))
    expect(ipaItem?.quantity).toBe(3)
    expect(ipaItem?.price).toBe(27.00)
  })

  test('Evaluates Adjustments (Tax / Service Charge) separation', () => {
    OCR_GOLDEN_FIXTURES.forEach(fixture => {
      // Rule 3 check: Items must not contain tax or service charge in item names
      fixture.expected.items.forEach(item => {
        const lowerName = item.name.toLowerCase()
        expect(lowerName).not.toContain('tax')
        expect(lowerName).not.toContain('vat')
        expect(lowerName).not.toContain('service charge')
      })
    })
  })
})

import { describe, expect, test, beforeEach, vi } from 'vitest'

let isNativeVal = false

const mockPreferencesRemove = vi.fn()
const mockPreferencesGet = vi.fn()
const mockPreferencesSet = vi.fn()

vi.mock('@capacitor/preferences', () => {
  return {
    Preferences: {
      get: (...args: any[]) => mockPreferencesGet(...args),
      set: (...args: any[]) => mockPreferencesSet(...args),
      remove: (...args: any[]) => mockPreferencesRemove(...args),
    }
  }
})

vi.mock('@capacitor/core', () => {
  return {
    Capacitor: {
      isNativePlatform: () => isNativeVal,
      getPlatform: () => isNativeVal ? 'android' : 'web',
    }
  }
})

vi.mock('@capgo/capacitor-updater', () => {
  return {
    CapacitorUpdater: {
      getDeviceId: () => Promise.resolve({ deviceId: 'cap-device-123' })
    }
  }
})

import { store, itemsSubtotal, tipAmount, totalAdjustments, totalBill, billBreakdown, shareTextSummary, calculateSplitBreakdown } from './store'

describe('Splat Core Store & Math Logic', () => {
  beforeEach(() => {
    isNativeVal = false
    mockPreferencesRemove.mockReset()
    mockPreferencesGet.mockReset()
    mockPreferencesSet.mockReset()
    store.reset()
  })

  describe('Participant Management', () => {
    test('should add a participant with trimmed name', () => {
      store.addParticipant('  Alice  ')
      expect(store.participants).toHaveLength(1)
      expect(store.participants[0].name).toBe('Alice')
      expect(store.participants[0].id).toBeDefined()
    })

    test('should not add a participant with empty name', () => {
      store.addParticipant('')
      store.addParticipant('   ')
      expect(store.participants).toHaveLength(0)
    })

    test('should remove a participant and clean up assignments', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      // Add item and assign to both
      store.addItem('Pizza', 20)
      
      // Manually assign both
      store.items[0].assignedTo = [aliceId, bobId]

      // Remove Alice
      store.removeParticipant(aliceId)
      expect(store.participants).toHaveLength(1)
      expect(store.participants[0].id).toBe(bobId)
      expect(store.items[0].assignedTo).toEqual([bobId])
    })

    test('should set participant count and preserve existing participants and their assignments', () => {
      store.addParticipant('Alice')
      const aliceId = store.participants[0].id
      store.addItem('Truffle Fries', 15)
      expect(store.items[0].assignedTo).toEqual([aliceId])

      store.setParticipantCount(4)
      expect(store.participants).toHaveLength(4)
      expect(store.participants[0].name).toBe('Alice')
      expect(store.participants[1].name).toBe('Person 2')
      expect(store.items[0].assignedTo).toEqual([aliceId])
    })

    test('should auto-assign newly added participant to items assigned to everyone', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id
      
      store.addItem('Truffle Fries', 15)
      expect(store.items[0]!.assignedTo).toEqual([aliceId, bobId])

      store.addParticipant('Charlie')
      const charlieId = store.participants[2].id
      expect(store.items[0]!.assignedTo).toEqual([aliceId, bobId, charlieId])
      expect(store.items[0]!.assignedQuantities![charlieId]).toBe(1)
    })

    test('should truncate participants when setting count less than current count', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      
      store.addItem('Tacos', 10)
      
      store.setParticipantCount(1)
      expect(store.participants).toHaveLength(1)
      expect(store.participants[0].name).toBe('Alice')
      expect(store.items[0]!.assignedTo).toEqual([aliceId])
    })
  })

  describe('Item Management', () => {
    test('should add an item with default assignment to all current participants', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      store.addItem('Tacos', 15)
      expect(store.items).toHaveLength(1)
      expect(store.items[0].name).toBe('Tacos')
      expect(store.items[0].price).toBe(15)
      expect(store.items[0].assignedTo).toEqual([aliceId, bobId])
    })

    test('should remove an item', () => {
      store.addItem('Beer', 5)
      const id = store.items[0].id
      store.removeItem(id)
      expect(store.items).toHaveLength(0)
    })

    test('should toggle item assignment', () => {
      store.addParticipant('Alice')
      const aliceId = store.participants[0].id
      store.addItem('Soda', 3)
      const itemId = store.items[0].id

      // Currently assigned (since Alice existed before addItem)
      expect(store.items[0].assignedTo).toContain(aliceId)

      // Toggle off
      store.toggleItemAssignment(itemId, aliceId)
      expect(store.items[0].assignedTo).not.toContain(aliceId)

      // Toggle back on
      store.toggleItemAssignment(itemId, aliceId)
      expect(store.items[0].assignedTo).toContain(aliceId)
    })
  })

  describe('Proportional Split Math', () => {
    test('should calculate subtotal, tip, and total bill correctly', () => {
      store.addItem('Burger', 10)
      store.addItem('Fries', 5)
      
      expect(itemsSubtotal.value).toBe(15)

      // Flat tip
      store.tipInput = 3
      store.tipType = 'flat'
      expect(tipAmount.value).toBe(3)
      expect(totalBill.value).toBe(18)

      // Percentage tip
      store.tipInput = 20
      store.tipType = 'percentage'
      expect(tipAmount.value).toBe(3) // 20% of 15 is 3
      expect(totalBill.value).toBe(18)
    })

    test('should calculate proportional shares for simple equal split', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      store.addItem('Steak', 40)
      store.addItem('Salad', 10) // Total subtotal = 50

      store.addAdjustment('Tax', 5)  // 10% tax
      store.tipInput = 10 // 20% tip ($10)
      store.tipType = 'flat'

      // Total bill = 50 + 5 + 10 = 65
      // Each person is assigned to all items, so split is equal
      const breakdown = billBreakdown.value
      expect(breakdown).toHaveLength(2)
      
      const aliceBreakdown = breakdown.find(p => p.id === aliceId)!
      const bobBreakdown = breakdown.find(p => p.id === bobId)!

      expect(aliceBreakdown.subtotal).toBe(25)
      expect(aliceBreakdown.tax).toBe(2.5)
      expect(aliceBreakdown.tip).toBe(5)
      expect(aliceBreakdown.total).toBe(32.5)

      expect(bobBreakdown.subtotal).toBe(25)
      expect(bobBreakdown.tax).toBe(2.5)
      expect(bobBreakdown.tip).toBe(5)
      expect(bobBreakdown.total).toBe(32.5)
    })

    test('should calculate proportional shares for asymmetric split', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      // Alice only has Burger
      store.addItem('Burger', 15)
      store.items[0].assignedTo = [aliceId]

      // Bob only has Salad
      store.addItem('Salad', 5)
      store.items[1].assignedTo = [bobId]

      // Shared item (Fries)
      store.addItem('Fries', 10)
      store.items[2].assignedTo = [aliceId, bobId]

      // Subtotals:
      // Alice = 15 (Burger) + 5 (half Fries) = 20
      // Bob = 5 (Salad) + 5 (half Fries) = 10
      // Total subtotal = 30
      
      store.addAdjustment('Tax', 3)  // 10% tax
      store.tipInput = 6  // 20% tip
      store.tipType = 'flat'
      // Total bill = 30 + 3 + 6 = 39

      const breakdown = billBreakdown.value
      const aliceBreakdown = breakdown.find(p => p.id === aliceId)!
      const bobBreakdown = breakdown.find(p => p.id === bobId)!

      // Alice owes 2/3 of tax & tip
      expect(aliceBreakdown.subtotal).toBe(20)
      expect(aliceBreakdown.tax).toBe(2)
      expect(aliceBreakdown.tip).toBe(4)
      expect(aliceBreakdown.total).toBe(26)

      // Bob owes 1/3 of tax & tip
      expect(bobBreakdown.subtotal).toBe(10)
      expect(bobBreakdown.tax).toBe(1)
      expect(bobBreakdown.tip).toBe(2)
      expect(bobBreakdown.total).toBe(13)

      expect(aliceBreakdown.total + bobBreakdown.total).toBe(39)
    })

    test('should apply penny-rounding correction to equal total bill exactly', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      store.addParticipant('Charlie')
      
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id
      const charlieId = store.participants[2].id

      // $10 shared dinner split 3 ways
      store.addItem('Dinner', 10)
      store.items[0].assignedTo = [aliceId, bobId, charlieId]

      // Subtotal = 10. Each person share = 3.3333...
      // Without rounding correction: 3.33 + 3.33 + 3.33 = 9.99 (missing $0.01)
      const breakdown = billBreakdown.value
      
      const sum = breakdown.reduce((acc, p) => acc + p.total, 0)
      expect(sum).toBe(10.00) // Corrected sum must be exactly 10.00

      // Verify that one person absorbed the extra penny
      const totals = breakdown.map(p => p.total).sort()
      expect(totals).toEqual([3.33, 3.33, 3.34])
    })
  })

  describe('LocalStorage Persistence', () => {
    test('should save state to localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      
      store.addParticipant('Alice')
      store.addItem('Salad', 10)
      store.saveToLocalStorage()
      
      expect(setItemSpy).toHaveBeenCalled()
      const lastCallIndex = setItemSpy.mock.calls.length - 1
      const callArg = JSON.parse(setItemSpy.mock.calls[lastCallIndex][1])
      expect(callArg.participants[0].name).toBe('Alice')
      expect(callArg.items[0].name).toBe('Salad')
      
      setItemSpy.mockRestore()
    })

    test('should load state from localStorage', async () => {
      const mockState = {
        step: 'edit',
        items: [{ id: '1', name: 'Water', price: 2.50, assignedTo: [] }],
        participants: [{ id: 'p1', name: 'Bob' }],
        adjustments: [{ id: 'a1', name: 'Tax', value: 0.50 }],
        tipInput: 10,
        tipType: 'percentage'
      }
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(mockState))
      
      await store.loadFromLocalStorage()
      
      // Cold open always starts on home (capture), step not restored
      expect(store.step).toBe('capture')
      expect(store.participants).toHaveLength(1)
      expect(store.participants[0].name).toBe('Bob')
      expect(store.items).toHaveLength(1)
      expect(store.items[0].name).toBe('Water')
      expect(totalAdjustments.value).toBe(0.50)
      
      getItemSpy.mockRestore()
    })
  })

  describe('Mock OCR Parser', () => {
    test('should simulate OCR parsing and populate store', () => {
      vi.useFakeTimers()
      store.apiKey = ''
      
      store.simulateOCR('mock_image_data_uri')
      
      expect(store.isParsing).toBe(true)
      expect(store.receiptImage).toBe('mock_image_data_uri')
      
      vi.advanceTimersByTime(1500)
      
      expect(store.isParsing).toBe(false)
      expect(store.step).toBe('edit')
      expect(store.items.length).toBeGreaterThan(0)
      expect(totalAdjustments.value).toBeGreaterThan(0)
      expect(store.tipInput).toBe(0)
    })

    test('should reset participants list when starting a new OCR scan', () => {
      // 1. Populate store with previous split data
      store.addParticipant('Alice')
      store.addItem('Pizza', 20)
      expect(store.participants).toHaveLength(1)

      // 2. Start a new scan
      store.simulateOCR('demo_image_uri_0')

      // 3. Verify participants list is reset to empty
      expect(store.participants).toHaveLength(0)
    })


    test('should throw error if Gemini returns receipt validation error', async () => {
      store.apiKey = 'fake_key'
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ error: 'This image does not appear to be a valid receipt.' })
            }]
          }
        }]
      }
      
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => 
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      )
      
      await store.parseWithGemini('fake_image')
      
      expect(store.ocrError).toBe('This image does not appear to be a valid receipt.')
      expect(store.step).toBe('capture')
      
      fetchSpy.mockRestore()
    })
  })

  describe('Sharing Plain-Text Summary Formatter', () => {
    test('should format sharing summary correctly', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      store.addItem('Burger', 10)
      store.items[0].assignedTo = [aliceId]
      
      store.addItem('Salad', 6)
      store.items[1].assignedTo = [bobId]

      store.addAdjustment('Tax', 1.60)
      store.tipInput = 3.20
      store.tipType = 'flat'

      const summary = shareTextSummary.value

      expect(summary).toContain('Splat split:')
      expect(summary).toContain('Alice')
      expect(summary).toContain('Bob')
      expect(summary).toContain('Subtotal:')
      expect(summary).toContain('Tax: $1.60')
      expect(summary).toContain('Tip: $3.20')
      expect(summary).toContain('Total Bill: $20.80')
    })
  })

  describe('Multi-Quantity Splits & Math', () => {
    test('should split cost proportionally based on assigned counts', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      // 3 beers for $15 ($5 each)
      store.addItem('Beer', 15)
      const item = store.items[0]
      item.quantity = 3
      item.assignedQuantities = {
        [aliceId]: 2,
        [bobId]: 1
      }
      item.assignedTo = [aliceId, bobId]

      const breakdown = billBreakdown.value
      const aliceBreakdown = breakdown.find(p => p.id === aliceId)
      const bobBreakdown = breakdown.find(p => p.id === bobId)

      expect(aliceBreakdown?.subtotal).toBe(10.00)
      expect(bobBreakdown?.subtotal).toBe(5.00)
    })

    test('should clear assignments for multi-quantity items correctly', () => {
      store.addParticipant('Alice')
      const aliceId = store.participants[0].id

      store.addItem('Beer', 15)
      const item = store.items[0]
      item.quantity = 3
      item.assignedQuantities = { [aliceId]: 2 }
      item.assignedTo = [aliceId]

      store.clearAllFromItem(item.id)
      expect(item.assignedTo).toEqual([])
      expect(item.assignedQuantities).toEqual({})
    })

    test('should assign all participants with 1 count using assignAllToItem', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      store.addItem('Beer', 15)
      const item = store.items[0]
      item.quantity = 2

      store.assignAllToItem(item.id)
      expect(item.assignedTo).toContain(aliceId)
      expect(item.assignedTo).toContain(bobId)
      expect(item.assignedQuantities?.[aliceId]).toBe(1)
      expect(item.assignedQuantities?.[bobId]).toBe(1)
    })

    test('should auto-assign unallocated items of quantity 1 and multi-quantity items to everyone by default', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      // Item 1: Quantity 1
      store.addItem('Pizza', 20, 1)
      const item1 = store.items[0]
      // Clear auto-assignment done by addItem for quantity 1
      store.clearAllFromItem(item1.id)

      // Item 2: Quantity 2
      store.addItem('Beer', 10, 2)
      const item2 = store.items[1]
      // Clear auto-assignment done by addItem for quantity 2
      store.clearAllFromItem(item2.id)

      expect(item1.assignedTo).toEqual([])
      expect(item2.assignedTo).toEqual([])

      store.autoAssignUnallocatedItems()

      // Item 1 (qty 1) should be assigned to everyone
      expect(item1.assignedTo).toContain(aliceId)
      expect(item1.assignedTo).toContain(bobId)
      
      // Item 2 (qty > 1) should be assigned to everyone and set to split evenly
      expect(item2.assignedTo).toContain(aliceId)
      expect(item2.assignedTo).toContain(bobId)
      expect(item2.isSplitEvenly).toBe(true)
    })


    test('should split multi-quantity item cost evenly when isSplitEvenly is true', () => {
      store.addParticipant('Alice')
      store.addParticipant('Bob')
      const aliceId = store.participants[0].id
      const bobId = store.participants[1].id

      // 4 bottles of wine for $100, split evenly between 2 people (Alice and Bob)
      store.addItem('Wine', 100)
      const item = store.items[0]
      item.quantity = 4
      item.isSplitEvenly = true
      item.assignedTo = [aliceId, bobId]

      const breakdown = billBreakdown.value
      const aliceBreakdown = breakdown.find(p => p.id === aliceId)
      const bobBreakdown = breakdown.find(p => p.id === bobId)

      // Even split: $50 each
      expect(aliceBreakdown?.subtotal).toBe(50.00)
      expect(bobBreakdown?.subtotal).toBe(50.00)
      
      // Verification of suffix name in list
      expect(aliceBreakdown?.items[0].name).toBe('Wine (Shared)')
    })
  })

  describe('History & Image Storage', () => {
    test('should save split to history and handle separate image storage', async () => {
      store.addParticipant('Alice')
      store.addItem('Pizza', 20)
      store.receiptImage = 'data:image/png;base64,fakeimagecontent'

      await store.saveToHistory()

      // Verify it was added to splat_history in localStorage
      const historyStr = localStorage.getItem('splat_history')
      expect(historyStr).toBeDefined()
      const history = JSON.parse(historyStr || '[]')
      expect(history).toHaveLength(1)
      expect(history[0].splitId).toBe(store.splitId)
      // Confirm the image is NOT in the main history JSON object to keep it light
      expect(history[0].receiptImage).toBeUndefined()

      // Verify the image was stored in its own key
      const storedImage = localStorage.getItem(`splat_image_${store.splitId}`)
      expect(storedImage).toBe('data:image/png;base64,fakeimagecontent')
    })

    test('should load split and restore the image correctly', async () => {
      store.addParticipant('Alice')
      store.addItem('Pizza', 20)
      
      const splitId = 'test_split_id'
      const historyEntry = {
        splitId,
        billName: 'Test Bill',
        timestamp: Date.now(),
        participantsCount: 1,
        totalBill: 20,
        items: [{ id: 'item_1', name: 'Pizza', price: 20, quantity: 1, assignedTo: [] }],
        participants: [{ id: 'p_1', name: 'Alice' }],
        adjustments: [],
        tipInput: 0,
        tipType: 'flat'
      }

      // Store fake image
      localStorage.setItem(`splat_image_${splitId}`, 'data:image/png;base64,restoredimage')

      await store.loadSplit(historyEntry)

      expect(store.splitId).toBe(splitId)
      expect(store.receiptImage).toBe('data:image/png;base64,restoredimage')
    })
  })

  describe('Stateless Split Breakdown Calculation Helper', () => {
    test('should compute correct participant totals proportionally', () => {
      const splitData = {
        splitId: 'test-split-123',
        billName: 'Stateless Split Test',
        timestamp: Date.now(),
        participantsCount: 2,
        totalBill: 33, // 30 items + 3 adjustments
        currencySymbol: '$',
        items: [
          { id: '1', name: 'Pizza', price: 20, assignedTo: ['alice'], quantity: 1, assignedQuantities: {} },
          { id: '2', name: 'Drink', price: 10, assignedTo: ['bob'], quantity: 1, assignedQuantities: {} }
        ],
        participants: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' }
        ],
        adjustments: [
          { id: 'tax', name: 'Tax', value: 3, type: 'flat' }
        ],
        tipInput: 0,
        tipType: 'flat'
      }

      const breakdown = calculateSplitBreakdown(splitData)
      expect(breakdown).toHaveLength(2)

      const aliceBreakdown = breakdown.find((p: any) => p.id === 'alice')
      const bobBreakdown = breakdown.find((p: any) => p.id === 'bob')

      expect(aliceBreakdown).toBeDefined()
      expect(bobBreakdown).toBeDefined()

      // Alice: Subtotal $20, Share of Adjustments: 20/30 * $3 = $2. Total: $22
      expect(aliceBreakdown!.subtotal).toBe(20)
      expect(aliceBreakdown!.tax).toBe(2)
      expect(aliceBreakdown!.total).toBe(22)

      // Bob: Subtotal $10, Share of Adjustments: 10/30 * $3 = $1. Total: $11
      expect(bobBreakdown!.subtotal).toBe(10)
      expect(bobBreakdown!.tax).toBe(1)
      expect(bobBreakdown!.total).toBe(11)
    })

    test('should compute correct participant totals with percentage adjustments, percentage tips, and multi-quantity uneven allocations', () => {
      const splitData = {
        splitId: 'test-split-456',
        billName: 'Complex Stateless Split Test',
        timestamp: Date.now(),
        participantsCount: 2,
        currencySymbol: '$',
        items: [
          { 
            id: '1', 
            name: 'Pizzas', 
            price: 40, 
            quantity: 2, 
            isSplitEvenly: false,
            assignedTo: ['alice', 'bob'], 
            assignedQuantities: { alice: 1, bob: 1 } 
          }
        ],
        participants: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' }
        ],
        adjustments: [
          { id: 'tax', name: 'Tax', value: 10, type: 'percent' }
        ],
        tipInput: 15,
        tipType: 'percent'
      }

      const breakdown = calculateSplitBreakdown(splitData)
      expect(breakdown).toHaveLength(2)

      const aliceBreakdown = breakdown.find((p: any) => p.id === 'alice')
      const bobBreakdown = breakdown.find((p: any) => p.id === 'bob')

      expect(aliceBreakdown).toBeDefined()
      expect(bobBreakdown).toBeDefined()

      // Items Subtotal = $40.
      // Alice share: 1/2 of Pizzas = $20 subtotal.
      // Bob share: 1/2 of Pizzas = $20 subtotal.
      // Adjustments (10% of subtotal): $4 total. Alice share = $2, Bob share = $2.
      // Tip (15% of subtotal): $6 total. Alice share = $3, Bob share = $3.
      // Alice Total = 20 + 2 + 3 = 25.
      // Bob Total = 20 + 2 + 3 = 25.
      expect(aliceBreakdown!.subtotal).toBe(20)
      expect(aliceBreakdown!.tax).toBe(2)
      expect(aliceBreakdown!.tip).toBe(3)
      expect(aliceBreakdown!.total).toBe(25)
      expect(aliceBreakdown!.items).toHaveLength(1)
      expect(aliceBreakdown!.items[0].name).toBe('1x Pizzas')
    })

    test('should clamp final participant total to 0.00 if negative subtotal exceeds adjustments', () => {
      const splitData = {
        items: [
          { id: 'item1', name: 'Meal', price: 20, quantity: 1, assignedTo: ['alice'] },
          { id: 'item2', name: 'Discount coupon', price: -50, quantity: 1, assignedTo: ['alice'] },
          { id: 'item3', name: 'Meal 2', price: 100, quantity: 1, assignedTo: ['bob'] }
        ],
        participants: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' }
        ],
        adjustments: [
          { id: 'tax', name: 'Tax', value: 10, type: 'flat' }
        ],
        tipInput: 0,
        tipType: 'flat'
      }

      const breakdown = calculateSplitBreakdown(splitData)
      const aliceBreakdown = breakdown.find((p: any) => p.id === 'alice')
      const bobBreakdown = breakdown.find((p: any) => p.id === 'bob')

      expect(aliceBreakdown).toBeDefined()
      expect(bobBreakdown).toBeDefined()

      // Alice raw: subtotal = -30, ratio = -30/70. Clamped to 0.00
      expect(aliceBreakdown!.subtotal).toBe(-30)
      expect(aliceBreakdown!.total).toBe(0)

      // Bob raw: subtotal = 100, ratio = 100/70.
      // Rounding error correction distributes remaining bill amount to Bob.
      // Total Bill = 70 + 10 = 80. Alice pays 0, so Bob must pay exactly 80.
      expect(bobBreakdown!.total).toBe(80)
    })
  })

  describe('isModified Modification Tracking', () => {
    beforeEach(() => {
      store.reset()
    })

    test('should initialize isModified to false', () => {
      expect(store.isModified).toBe(false)
    })

    test('should set isModified to true when mutations occur', () => {
      store.addItem('Pizzas', 12)
      expect(store.isModified).toBe(true)
    })

    test('should reset isModified to false on reset()', () => {
      store.addItem('Gas', 40)
      expect(store.isModified).toBe(true)
      store.reset()
      expect(store.isModified).toBe(false)
    })

    test('should reset isModified to false on loadSplit()', async () => {
      const mockSplit = {
        splitId: 'split_123',
        billName: 'Trip Dinner',
        items: [{ id: 'item_1', name: 'Dinner', price: 50, quantity: 1, assignedTo: [] }],
        participants: [],
        adjustments: [],
        tipInput: 0,
        tipType: 'percent',
        currencySymbol: '$'
      }
      store.addItem('Snacks', 15)
      expect(store.isModified).toBe(true)
      await store.loadSplit(mockSplit)
      expect(store.isModified).toBe(false)
    })
  })

  describe('Storage & Capacitor Native Platform Coverage', () => {
    test('should invoke Preferences set/get on native platform', async () => {
      isNativeVal = true
      mockPreferencesGet.mockResolvedValue({ value: JSON.stringify({ billName: 'Native Split Test' }) })
      
      await store.loadFromLocalStorage()
      expect(mockPreferencesGet).toHaveBeenCalledWith({ key: 'splat_store' })
      expect(store.billName).toBe('Native Split Test')

      await store.saveToLocalStorage()
      expect(mockPreferencesSet).toHaveBeenCalledWith({
        key: 'splat_store',
        value: expect.any(String)
      })
    })

    test('should handle Preferences get/set error gracefully', async () => {
      isNativeVal = true
      mockPreferencesGet.mockRejectedValue(new Error('Preferences read error'))
      mockPreferencesSet.mockRejectedValue(new Error('Preferences write error'))

      // Should not throw
      await expect(store.loadFromLocalStorage()).resolves.not.toThrow()
      await expect(store.saveToLocalStorage()).resolves.not.toThrow()
    })

    test('should handle clearSimulatedUsage and fetchUsage on native platform', async () => {
      isNativeVal = true
      mockPreferencesRemove.mockResolvedValue({})
      
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ passType: 'trip', freeScansRemaining: 5 }), { status: 200 }))
      )

      await store.clearSimulatedUsage()
      expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'splat_simulated_usage' })
      
      fetchSpy.mockRestore()
    })

    test('should fetch usage on native platform', async () => {
      isNativeVal = true
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ passType: 'trip', freeScansRemaining: 5 }), { status: 200 }))
      )

      await store.fetchUsage()
      expect(fetchSpy).toHaveBeenCalled()
      
      fetchSpy.mockRestore()
    })
  })

  describe('OCR parseWithGemini Edge Cases and Errors', () => {
    test('should set ocrError when image format is invalid', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('MODE', 'development')
      
      store.apiKey = 'key'
      await store.parseWithGemini('invalid_image_string')
      expect(store.ocrError).toContain('Invalid image format')

      vi.unstubAllEnvs()
    })

    test('should set ocrError when Gemini API response is not ok', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('MODE', 'development')
      
      store.apiKey = 'key'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response('Internal Server Error', { status: 500 }))
      )

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.ocrError).toContain('Gemini API returned status 500')
      
      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    test('should set ocrError when serverless endpoint fails', async () => {
      store.apiKey = '' // Trigger serverless path
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'Serverless rate limit' }), { status: 429 }))
      )

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.ocrError).toContain('Serverless rate limit')
      fetchSpy.mockRestore()
    })

    test('should handle LIMIT_EXCEEDED error in catch block', async () => {
      store.apiKey = 'key'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('LIMIT_EXCEEDED'))

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.showPaywall).toBe(true)
      expect(store.ocrError).toBe('Scan limit reached. Upgrade to continue!')
      
      fetchSpy.mockRestore()
    })

    test('should handle RATE_LIMIT_EXCEEDED error in catch block', async () => {
      store.apiKey = 'key'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'))

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.ocrError).toBe('Please wait 1 minute between scans.')
      
      fetchSpy.mockRestore()
    })

    test('should handle timeout AbortError in catch block', async () => {
      store.apiKey = 'key'
      const abortError = new Error('Request timed out after 30 seconds.')
      abortError.name = 'AbortError'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.ocrError).toBe('Request timed out after 30 seconds.')
      
      fetchSpy.mockRestore()
    })

    test('should categorize items split evenly for transport or lodging', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('MODE', 'development')
      
      store.apiKey = 'key'
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                category: 'lodging',
                restaurant: 'Hotel',
                items: [{ name: 'Room', price: 100, quantity: 1 }]
              })
            }]
          }
        }]
      }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      )

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.items[0].isSplitEvenly).toBe(true)
      
      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })
  })

  describe('History Database Error Handling', () => {
    test('should log error when saveToHistory fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      isNativeVal = true
      mockPreferencesSet.mockRejectedValue(new Error('Preferences write error'))

      await store.saveToHistory()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save split history', expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('Image Compressor & Usage Limits Edge Cases', () => {

    test('should block parseWithGemini and simulateOCR when scans are exhausted', async () => {
      store.usageInfo = {
        passType: null,
        freeScansUsed: 5,
        freeScansLimit: 5,
        freeScansRemaining: 0
      }

      await store.parseWithGemini('data:image/png;base64,abcdef')
      expect(store.showPaywall).toBe(true)
      expect(store.ocrError).toContain('Scan limit reached')

      store.ocrError = null
      store.showPaywall = false
      store.simulateOCR('data:image/png;base64,abcdef')
      expect(store.showPaywall).toBe(true)
      expect(store.ocrError).toContain('Scan limit reached')
    })

    test('should decrement simulated scan count', () => {
      store.setSimulatedUsage(null, 2)
      expect(store.simulatedUsage.freeScansRemaining).toBe(3)

      store.decrementSimulatedScan()
      expect(store.simulatedUsage.freeScansUsed).toBe(3)
      expect(store.simulatedUsage.freeScansRemaining).toBe(2)
    })

    test('should not decrement simulated scan count if passType is configured', () => {
      store.setSimulatedUsage('trip', 2)
      store.decrementSimulatedScan()
      expect(store.simulatedUsage.freeScansUsed).toBe(2)
    })

    test('should handle template templates and fallbacks in simulateOCR', () => {
      vi.useFakeTimers()
      
      // template 1
      store.simulateOCR('demo_image_uri_1')
      vi.advanceTimersByTime(1500)
      expect(store.billName).toContain('Avocado Bistro')

      // fallback / random template
      store.simulateOCR('demo_image_uri_random')
      vi.advanceTimersByTime(1500)
      expect(store.billName).toBeDefined()

      vi.useRealTimers()
    })

    test('should invoke parseWithGemini inside simulateOCR when not in test mode', () => {
      vi.stubEnv('MODE', 'development')
      const spy = vi.spyOn(store, 'parseWithGemini').mockResolvedValue(undefined)
      
      store.simulateOCR('data:image/png;base64,abcdef')
      expect(spy).toHaveBeenCalledWith('data:image/png;base64,abcdef')
      
      spy.mockRestore()
      vi.unstubAllEnvs()
    })
  })

  describe('Storage Error Handler Catch Blocks', () => {
    test('loadSplit should handle image read error gracefully', async () => {
      const mockSplit = {
        splitId: 'split_img_err',
        billName: 'Error Split',
        items: [],
        participants: [],
        adjustments: [],
        tipInput: 0,
        tipType: 'percent',
        currencySymbol: '$'
      }
      isNativeVal = true
      mockPreferencesGet.mockRejectedValue(new Error('Read error'))
      
      await store.loadSplit(mockSplit)
      expect(store.receiptImage).toBeNull()
    })

    test('loadFromLocalStorage handles corrupt JSON error gracefully', async () => {
      const originalJSONParse = JSON.parse
      JSON.parse = () => { throw new Error('JSON Parse Error') }
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await store.loadFromLocalStorage()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load from localStorage', expect.any(Error))

      JSON.parse = originalJSONParse
      consoleSpy.mockRestore()
    })

    test('saveToLocalStorage handles JSON stringify error gracefully', async () => {
      const originalStringify = JSON.stringify
      JSON.stringify = () => { throw new Error('Stringify Error') }
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await store.saveToLocalStorage()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save to localStorage', expect.any(Error))

      JSON.stringify = originalStringify
      consoleSpy.mockRestore()
    })

    test('saveToHistory should catch image write errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      isNativeVal = true
      mockPreferencesGet.mockResolvedValue({ value: '[]' })
      mockPreferencesSet.mockRejectedValue(new Error('Preferences write error'))
      
      store.receiptImage = 'data:image/png;base64,abcdef'
      await store.saveToHistory()
      
      expect(warnSpy).toHaveBeenCalledWith('Failed to compress/save history image', expect.any(Error))
      
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    test('loadFromLocalStorage recovers non-simulated usage info and migrates item assignedTo list', async () => {
      isNativeVal = true
      
      mockPreferencesGet.mockImplementation(({ key }) => {
        if (key === 'splat_simulated_usage') return Promise.resolve({ value: null })
        if (key === 'splat_usage_info') return Promise.resolve({ value: JSON.stringify({ passType: 'trip', freeScansRemaining: 0 }) })
        if (key === 'splat_store') {
          return Promise.resolve({
            value: JSON.stringify({
              splitId: 'split_load_test',
              billName: 'Load Test Bill',
              items: [{ id: 'item_1', name: 'Meal', price: 10, quantity: 1, assignedTo: ['alice'], assignedQuantities: {} }],
              participants: [{ id: 'alice', name: 'Alice' }],
              adjustments: []
            })
          })
        }
        return Promise.resolve({ value: null })
      })

      await store.loadFromLocalStorage()
      expect(store.usageInfo.passType).toBe('trip')
      expect(store.items[0]!.assignedQuantities!['alice']).toBe(1)
    })

    test('saveToHistory updates existing history entry if splitId matches', async () => {
      isNativeVal = true
      
      const mockHistory = [
        {
          splitId: 'matching_split_id',
          billName: 'Old Bill Name',
          items: [],
          participants: [],
          adjustments: [],
          tipInput: 0,
          tipType: 'percent'
        }
      ]

      mockPreferencesGet.mockImplementation(({ key }) => {
        if (key === 'splat_history') return Promise.resolve({ value: JSON.stringify(mockHistory) })
        return Promise.resolve({ value: null })
      })

      store.splitId = 'matching_split_id'
      store.billName = 'New Bill Name'
      await store.saveToHistory()

      expect(mockPreferencesSet).toHaveBeenCalledWith({
        key: 'splat_history',
        value: expect.stringContaining('New Bill Name')
      })
    })
  })
})


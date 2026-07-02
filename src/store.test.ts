import { describe, expect, test, beforeEach, vi } from 'vitest'
import { store, itemsSubtotal, tipAmount, totalAdjustments, totalBill, billBreakdown, shareTextSummary } from './store'

describe('Splat Core Store & Math Logic', () => {
  beforeEach(() => {
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
      
      vi.useRealTimers()
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

    test('should auto-assign unallocated items of quantity 1, but leave multi-quantity items unassigned', () => {
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

      expect(item1.assignedTo).toEqual([])
      expect(item2.assignedTo).toEqual([])

      store.autoAssignUnallocatedItems()

      // Item 1 (qty 1) should be assigned to everyone
      expect(item1.assignedTo).toContain(aliceId)
      expect(item1.assignedTo).toContain(bobId)
      
      // Item 2 (qty > 1) should remain unassigned (nobody by default)
      expect(item2.assignedTo).toEqual([])
      expect(item2.assignedQuantities).toEqual({})
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
})


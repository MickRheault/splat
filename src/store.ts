import { reactive, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export const getStorageItem = async (key: string): Promise<string | null> => {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key })
    return value
  }
  return localStorage.getItem(key)
}

export const setStorageItem = async (key: string, value: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key, value })
  } else {
    localStorage.setItem(key, value)
  }
}

export interface Item {
  id: string
  name: string
  price: number
  assignedTo: string[] // Participant IDs
}

export interface Participant {
  id: string
  name: string
}

export interface Adjustment {
  id: string
  name: string
  value: number
}

// Mock receipt templates for testing
const MOCK_RECEIPT_TEMPLATES = [
  {
    items: [
      { name: 'Truffle Fries', price: 14.50 },
      { name: 'Margherita Pizza', price: 21.00 },
      { name: 'Ribeye Steak', price: 42.00 },
      { name: 'Craft Beer IPA', price: 9.00 },
      { name: 'Red Wine Glass', price: 12.00 },
      { name: 'Chocolate Lava Cake', price: 11.50 }
    ],
    tax: 9.35,
    tip: 20
  },
  {
    items: [
      { name: 'Avocado Toast', price: 16.00 },
      { name: 'Eggs Benedict', price: 18.50 },
      { name: 'Cold Brew Coffee', price: 6.50 },
      { name: 'Matcha Latte', price: 7.00 },
      { name: 'Acai Bowl', price: 15.00 }
    ],
    tax: 5.80,
    tip: 18
  }
]

const getTodayFormatted = () => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const store = reactive({
  step: 'capture' as 'capture' | 'edit' | 'participants' | 'allocate' | 'share',
  receiptImage: null as string | null,
  splitId: `split_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  billName: 'New Split',
  items: [] as Item[],
  participants: [] as Participant[],
  adjustments: [] as Adjustment[],
  tipInput: 0,
  tipType: 'percentage' as 'percentage' | 'flat',
  currencySymbol: '$',
  isParsing: false,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  ocrError: null as string | null,

  reset() {
    this.step = 'capture'
    this.receiptImage = null
    this.splitId = `split_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.billName = 'New Split'
    this.items = []
    this.participants = []
    this.adjustments = []
    this.tipInput = 0
    this.tipType = 'percentage'
    this.ocrError = null
    this.saveToLocalStorage()
  },

  simulateOCR(imageSrc: string) {
    this.isParsing = true
    this.receiptImage = imageSrc
    this.ocrError = null
    this.saveToLocalStorage()

    if (this.apiKey && !imageSrc.startsWith('demo_image_uri_')) {
      this.parseWithGemini(imageSrc)
    } else {
      setTimeout(() => {
        let template = MOCK_RECEIPT_TEMPLATES[0]
        let restName = 'Truffle Garden'
        if (imageSrc === 'demo_image_uri_1') {
          template = MOCK_RECEIPT_TEMPLATES[1]
          restName = 'Avocado Bistro'
        } else if (imageSrc === 'demo_image_uri_0') {
          template = MOCK_RECEIPT_TEMPLATES[0]
          restName = 'Truffle Garden'
        } else {
          template = MOCK_RECEIPT_TEMPLATES[Math.floor(Math.random() * MOCK_RECEIPT_TEMPLATES.length)]
          restName = Math.random() > 0.5 ? 'Gourmet Grill' : 'Street Food Stall'
        }
        
        this.billName = `${getTodayFormatted()} - ${restName}`

        this.items = template.items.map((item, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          name: item.name,
          price: item.price,
          assignedTo: []
        }))
        
        this.adjustments = [
          { id: `adj_${Date.now()}_0`, name: 'Tax / VAT', value: template.tax }
        ]
        this.tipInput = 0
        this.tipType = 'percentage'
        
        this.isParsing = false
        this.step = 'edit'
        this.saveToLocalStorage()
      }, 1500)
    }
  },

  addAdjustment(name = 'New Charge', value = 0) {
    this.adjustments.push({
      id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      value
    })
    this.saveToLocalStorage()
  },

  removeAdjustment(id: string) {
    this.adjustments = this.adjustments.filter(a => a.id !== id)
    this.saveToLocalStorage()
  },

  async parseWithGemini(imageSrc: string) {
    try {
      const apiBase = Capacitor.isNativePlatform() 
        ? 'https://splat-chi.vercel.app' 
        : ''
      
      const response = await fetch(`${apiBase}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc })
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.error || `Serverless Error: Status ${response.status}`)
      }

      const resJson = await response.json()
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('Gemini API returned an empty response.')
      }

      const result = JSON.parse(text)
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      this.items = (result.items || []).map((item: any, idx: number) => ({
        id: `item_${Date.now()}_${idx}`,
        name: item.name || 'Unknown Item',
        price: Number(item.price) || 0,
        assignedTo: []
      }))
      this.adjustments = (result.adjustments || []).map((adj: any, idx: number) => ({
        id: `adj_${Date.now()}_${idx}`,
        name: adj.name || 'Tax',
        value: Number(adj.value) || 0
      }))
      this.tipInput = Number(result.tip) || 0
      this.tipType = 'flat'
      
      // Auto-generate Bill Name
      const parsedDate = result.date ? result.date.trim() : getTodayFormatted()
      const parsedRestaurant = result.restaurant ? result.restaurant.trim() : 'Restaurant Split'
      this.billName = `${parsedDate} - ${parsedRestaurant}`

      this.currencySymbol = result.currency || '$'
      this.step = 'edit'
    } catch (e: any) {
      console.error(e)
      this.ocrError = e.message || 'Failed to parse receipt'
    } finally {
      this.isParsing = false
      this.saveToLocalStorage()
    }
  },

  addParticipant(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.participants.push({ id, name: trimmed })
    
    // Auto-assign new participant to items that are currently assigned to everyone
    this.items.forEach(item => {
      if (item.assignedTo.length > 0) {
        const allPrev = this.participants.slice(0, -1).map(p => p.id)
        const isEveryoneAssigned = allPrev.every(pId => item.assignedTo.includes(pId))
        if (isEveryoneAssigned) {
          item.assignedTo.push(id)
        }
      }
    })
    this.saveToLocalStorage()
  },

  removeParticipant(id: string) {
    this.participants = this.participants.filter(p => p.id !== id)
    this.items.forEach(item => {
      item.assignedTo = item.assignedTo.filter(pId => pId !== id)
    })
    this.saveToLocalStorage()
  },

  setParticipantCount(count: number) {
    const currentCount = this.participants.length
    
    if (count < currentCount) {
      // Truncate: keep the first 'count' participants
      const keptParticipants = this.participants.slice(0, count)
      const keptIds = keptParticipants.map(p => p.id)
      
      this.participants = keptParticipants
      
      // Clean up item assignments for deleted participants
      this.items.forEach(item => {
        item.assignedTo = item.assignedTo.filter(pId => keptIds.includes(pId))
      })
    } else if (count > currentCount) {
      // Append: keep all existing, and add new ones
      for (let i = currentCount; i < count; i++) {
        const id = `p_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`
        this.participants.push({
          id,
          name: `Person ${i + 1}`
        })
      }
    }
    
    this.saveToLocalStorage()
  },

  addItem(name = 'New Item', price = 0) {
    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const assignedTo = this.participants.map(p => p.id)
    this.items.push({ id, name, price, assignedTo })
    this.saveToLocalStorage()
  },

  removeItem(id: string) {
    this.items = this.items.filter(item => item.id !== id)
    this.saveToLocalStorage()
  },

  toggleItemAssignment(itemId: string, participantId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    
    const index = item.assignedTo.indexOf(participantId)
    if (index > -1) {
      item.assignedTo.splice(index, 1)
    } else {
      item.assignedTo.push(participantId)
    }
    this.saveToLocalStorage()
  },

  assignAllToItem(itemId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    item.assignedTo = this.participants.map(p => p.id)
    this.saveToLocalStorage()
  },

  clearAllFromItem(itemId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    item.assignedTo = []
    this.saveToLocalStorage()
  },

  async saveToLocalStorage() {
    try {
      const data = {
        step: this.step,
        receiptImage: this.receiptImage,
        splitId: this.splitId,
        billName: this.billName,
        items: this.items,
        participants: this.participants,
        adjustments: this.adjustments,
        tipInput: this.tipInput,
        tipType: this.tipType,
        currencySymbol: this.currencySymbol
      }
      await setStorageItem('splat_store', JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save to localStorage', e)
    }
  },

  async loadFromLocalStorage() {
    try {
      const dataStr = await getStorageItem('splat_store')
      if (!dataStr) return
      const data = JSON.parse(dataStr)
      if (data.step) this.step = data.step
      if (data.receiptImage !== undefined) this.receiptImage = data.receiptImage
      if (data.splitId) this.splitId = data.splitId
      if (data.billName) this.billName = data.billName
      if (data.items) this.items = data.items
      if (data.participants) this.participants = data.participants
      if (data.adjustments) this.adjustments = data.adjustments
      if (data.tipInput !== undefined) this.tipInput = Number(data.tipInput) || 0
      if (data.tipType) this.tipType = data.tipType
      if (data.currencySymbol) this.currencySymbol = data.currencySymbol
    } catch (e) {
      console.error('Failed to load from localStorage', e)
    }
  },

  async saveToHistory() {
    try {
      const historyStr = await getStorageItem('splat_history') || '[]'
      const history = JSON.parse(historyStr) as any[]
      
      const entry = {
        splitId: this.splitId,
        billName: this.billName,
        timestamp: Date.now(),
        participantsCount: this.participants.length,
        totalBill: totalBill.value,
        currencySymbol: this.currencySymbol,
        items: JSON.parse(JSON.stringify(this.items)),
        participants: JSON.parse(JSON.stringify(this.participants)),
        adjustments: JSON.parse(JSON.stringify(this.adjustments)),
        tipInput: this.tipInput,
        tipType: this.tipType
      }
      
      const existingIdx = history.findIndex((h: any) => h.splitId === this.splitId)
      if (existingIdx !== -1) {
        history[existingIdx] = entry
      } else {
        history.unshift(entry)
      }
      
      await setStorageItem('splat_history', JSON.stringify(history))
    } catch (e) {
      console.error('Failed to save split history', e)
    }
  },

  async loadSplit(split: any) {
    this.splitId = split.splitId
    this.billName = split.billName
    this.items = split.items
    this.participants = split.participants
    this.adjustments = split.adjustments
    this.tipInput = split.tipInput
    this.tipType = split.tipType
    this.currencySymbol = split.currencySymbol || '$'
    this.step = 'share'
    await this.saveToLocalStorage()
  }
})

// Computed calculations
export const itemsSubtotal = computed(() => {
  return store.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0)
})

export const tipAmount = computed(() => {
  const sub = itemsSubtotal.value
  if (store.tipType === 'percentage') {
    return sub * ((Number(store.tipInput) || 0) / 100)
  }
  return Number(store.tipInput) || 0
})

export const totalAdjustments = computed(() => {
  return store.adjustments.reduce((sum, adj) => sum + (Number(adj.value) || 0), 0)
})

export const totalBill = computed(() => {
  return itemsSubtotal.value + totalAdjustments.value + tipAmount.value
})

export const billBreakdown = computed(() => {
  const activeParticipants = store.participants
  const activeItems = store.items
  const subtotalVal = itemsSubtotal.value
  const taxVal = totalAdjustments.value
  const tipVal = tipAmount.value
  const totalVal = totalBill.value

  if (activeParticipants.length === 0) return []

  const subtotals: Record<string, number> = {}
  activeParticipants.forEach(p => { subtotals[p.id] = 0 })

  activeItems.forEach(item => {
    const price = Number(item.price) || 0
    const assignees = item.assignedTo.length > 0 ? item.assignedTo : activeParticipants.map(p => p.id)
    const share = price / assignees.length
    assignees.forEach(pId => {
      if (subtotals[pId] !== undefined) {
        subtotals[pId] += share
      }
    })
  })

  let calculatedGrandTotal = 0
  const list = activeParticipants.map(p => {
    const individualSubtotal = subtotals[p.id]
    const ratio = subtotalVal > 0 ? individualSubtotal / subtotalVal : 1 / activeParticipants.length
    
    const taxShare = taxVal * ratio
    const tipShare = tipVal * ratio
    
    const subtotalRounded = Math.round(individualSubtotal * 100) / 100
    const taxRounded = Math.round(taxShare * 100) / 100
    const tipRounded = Math.round(tipShare * 100) / 100
    const totalRounded = Math.round((individualSubtotal + taxShare + tipShare) * 100) / 100
    
    calculatedGrandTotal += totalRounded

    return {
      id: p.id,
      name: p.name,
      subtotal: subtotalRounded,
      tax: taxRounded,
      tip: tipRounded,
      total: totalRounded
    }
  })

  // Penny rounding error correction
  const roundingError = Math.round((totalVal - calculatedGrandTotal) * 100) / 100
  if (roundingError !== 0 && list.length > 0) {
    let maxIdx = 0
    let maxSub = -1
    list.forEach((p, idx) => {
      if (p.subtotal > maxSub) {
        maxSub = p.subtotal
        maxIdx = idx
      }
    })
    list[maxIdx].total = Math.round((list[maxIdx].total + roundingError) * 100) / 100
  }

  return list
})

export const shareTextSummary = computed(() => {
  const breakdown = billBreakdown.value
  const currency = store.currencySymbol
  
  let text = `💸 *Splat split: ${store.billName}* 💸\n\n`
  
  breakdown.forEach(p => {
    text += `👤 *${p.name}* owes *${currency}${p.total.toFixed(2)}*\n`
    text += `   ↳ Subtotal: ${currency}${p.subtotal.toFixed(2)}\n`
    if (p.tax !== 0) text += `   ↳ Adjustments/Fees: ${currency}${p.tax.toFixed(2)}\n`
    if (p.tip > 0) text += `   ↳ Tip: ${currency}${p.tip.toFixed(2)}\n`
    text += `\n`
  })
  
  text += `---------------------------\n`
  text += `🧾 *Subtotal:* ${currency}${itemsSubtotal.value.toFixed(2)}\n`
  
  store.adjustments.forEach(adj => {
    if (adj.value !== 0) {
      text += `🏛️ *${adj.name}:* ${currency}${adj.value.toFixed(2)}\n`
    }
  })
  
  if (tipAmount.value > 0) text += `💡 *Tip:* ${currency}${tipAmount.value.toFixed(2)}\n`
  text += `💰 *Total Bill:* ${currency}${totalBill.value.toFixed(2)}\n\n`
  text += `Split proportionally using Splat!`
  
  return text
})

import { reactive, computed } from 'vue'

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

export const store = reactive({
  step: 'capture' as 'capture' | 'edit' | 'participants' | 'allocate' | 'share',
  receiptImage: null as string | null,
  items: [] as Item[],
  participants: [] as Participant[],
  taxInput: 0,
  tipInput: 0,
  tipType: 'percentage' as 'percentage' | 'flat',
  currencySymbol: '$',
  isParsing: false,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  ocrError: null as string | null,

  reset() {
    this.step = 'capture'
    this.receiptImage = null
    this.items = []
    this.participants = []
    this.taxInput = 0
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
        if (imageSrc === 'demo_image_uri_1') {
          template = MOCK_RECEIPT_TEMPLATES[1]
        } else if (imageSrc === 'demo_image_uri_0') {
          template = MOCK_RECEIPT_TEMPLATES[0]
        } else {
          template = MOCK_RECEIPT_TEMPLATES[Math.floor(Math.random() * MOCK_RECEIPT_TEMPLATES.length)]
        }
        
        this.items = template.items.map((item, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          name: item.name,
          price: item.price,
          assignedTo: []
        }))
        
        this.taxInput = template.tax
        this.tipInput = 0
        this.tipType = 'percentage'
        
        this.isParsing = false
        this.step = 'edit'
        this.saveToLocalStorage()
      }, 1500)
    }
  },

  async parseWithGemini(imageSrc: string) {
    try {
      const base64Data = imageSrc.includes(';base64,') 
        ? imageSrc.split(';base64,')[1] 
        : imageSrc

      const prompt = 'Analyze this receipt image. Extract all line items and their prices. For the "tax" field, calculate the sum of all tax lines, VAT, service charges, credit card fees, and rounding adjustments (sum them up if there are multiple, so that all additional subtotal fees are captured). Extract the tip amount (if explicitly written, otherwise set tip to 0). Also detect the currency symbol or currency code used on the receipt (e.g. $, €, £, ¥, SGD, etc.). Provide the output in a strict JSON format matching this schema: {"items": [{"name": "item name", "price": 12.34}], "tax": 1.23, "tip": 0.0, "currency": "$"}. If the currency is not specified or cannot be identified, default the "currency" field to "$". Do not wrap the JSON in markdown code blocks, just return raw JSON.'

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API Error: Status ${response.status}`)
      }

      const resJson = await response.json()
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('Gemini API returned an empty response.')
      }

      const result = JSON.parse(text)
      
      this.items = (result.items || []).map((item: any, idx: number) => ({
        id: `item_${Date.now()}_${idx}`,
        name: item.name || 'Unknown Item',
        price: Number(item.price) || 0,
        assignedTo: []
      }))
      this.taxInput = Number(result.tax) || 0
      this.tipInput = Number(result.tip) || 0
      this.tipType = 'flat'
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

  saveToLocalStorage() {
    try {
      const data = {
        step: this.step,
        receiptImage: this.receiptImage,
        items: this.items,
        participants: this.participants,
        taxInput: this.taxInput,
        tipInput: this.tipInput,
        tipType: this.tipType,
        currencySymbol: this.currencySymbol
      }
      localStorage.setItem('splat_store', JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save to localStorage', e)
    }
  },

  loadFromLocalStorage() {
    try {
      const dataStr = localStorage.getItem('splat_store')
      if (!dataStr) return
      const data = JSON.parse(dataStr)
      if (data.step) this.step = data.step
      if (data.receiptImage !== undefined) this.receiptImage = data.receiptImage
      if (data.items) this.items = data.items
      if (data.participants) this.participants = data.participants
      if (data.taxInput !== undefined) this.taxInput = Number(data.taxInput) || 0
      if (data.tipInput !== undefined) this.tipInput = Number(data.tipInput) || 0
      if (data.tipType) this.tipType = data.tipType
      if (data.currencySymbol) this.currencySymbol = data.currencySymbol
    } catch (e) {
      console.error('Failed to load from localStorage', e)
    }
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

export const totalBill = computed(() => {
  return itemsSubtotal.value + (Number(store.taxInput) || 0) + tipAmount.value
})

export const billBreakdown = computed(() => {
  const activeParticipants = store.participants
  const activeItems = store.items
  const subtotalVal = itemsSubtotal.value
  const taxVal = Number(store.taxInput) || 0
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
  
  let text = `💸 *Splat Bill Split Summary* 💸\n\n`
  
  breakdown.forEach(p => {
    text += `👤 *${p.name}* owes *${currency}${p.total.toFixed(2)}*\n`
    text += `   ↳ Subtotal: ${currency}${p.subtotal.toFixed(2)}\n`
    if (p.tax > 0) text += `   ↳ Tax: ${currency}${p.tax.toFixed(2)}\n`
    if (p.tip > 0) text += `   ↳ Tip: ${currency}${p.tip.toFixed(2)}\n`
    text += `\n`
  })
  
  text += `---------------------------\n`
  text += `🧾 *Subtotal:* ${currency}${itemsSubtotal.value.toFixed(2)}\n`
  if (store.taxInput > 0) text += `🏛️ *Tax:* ${currency}${store.taxInput.toFixed(2)}\n`
  if (tipAmount.value > 0) text += `💡 *Tip:* ${currency}${tipAmount.value.toFixed(2)}\n`
  text += `💰 *Total Bill:* ${currency}${totalBill.value.toFixed(2)}\n\n`
  text += `Split proportionally using Splat!`
  
  return text
})

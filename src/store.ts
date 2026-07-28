import { reactive, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { billingManager, getDeviceId } from './services/billing'

export { getDeviceId }

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

export const removeStorageItem = async (key: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key })
  } else {
    localStorage.removeItem(key)
  }
}

export const compressAndResizeImage = (dataUrl: string, maxDim = 800): Promise<string> => {
  return new Promise((resolve) => {
    // If it's a demo image or not a base64 data url, or in test environment, return as is
    if (
      !dataUrl || 
      !dataUrl.startsWith('data:image') || 
      (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')
    ) {
      return resolve(dataUrl)
    }
    
    try {
      const img = new Image()
      img.src = dataUrl
      img.onload = () => {
        try {
          let width = img.width
          let height = img.height
          
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            } else {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }
          
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            return resolve(dataUrl) // Fallback if context not available
          }
          
          ctx.drawImage(img, 0, 0, width, height)
          // Export as compressed JPEG
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7)
          resolve(compressedDataUrl)
        } catch (e) {
          console.warn('Canvas compression failed', e)
          resolve(dataUrl)
        }
      }
      img.onerror = (err) => {
        console.warn('Failed to load image for compression', err)
        resolve(dataUrl) // Fallback to original
      }
    } catch (e) {
      console.warn('Image instantiation failed', e)
      resolve(dataUrl)
    }
  })
}



export interface Item {
  id: string
  name: string
  price: number
  assignedTo: string[] // Participant IDs
  quantity: number
  assignedQuantities?: Record<string, number>
  isSplitEvenly?: boolean
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
      { name: 'Craft Beer IPA', price: 27.00, quantity: 3 },
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
  category: 'food_drink' as 'food_drink' | 'groceries' | 'transport_fuel' | 'lodging' | 'tickets_entertainment' | 'shopping' | 'activities' | 'general',
  isParsing: false,
  isModified: false,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  ocrError: null as string | null,
  showPaywall: false,
  usageInfo: {
    passType: null,
    freeScansUsed: 0,
    freeScansLimit: 5,
    freeScansRemaining: 5
  } as any,
  simulatedUsage: null as any,
  fetchUsageCount: 0,

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
    this.showPaywall = false
    this.category = 'food_drink'
    this.currencySymbol = '$'
    this.isModified = false
    this.saveToLocalStorage(false)
  },

  simulateOCR(imageSrc: string) {
    if (this.usageInfo && !this.usageInfo.passType && this.usageInfo.freeScansRemaining <= 0) {
      this.showPaywall = true
      this.ocrError = 'Scan limit reached. Upgrade to continue!'
      return
    }

    // Reset active split state for the new scan
    this.participants = []
    this.items = []
    this.adjustments = []
    this.tipInput = 0
    this.ocrError = null
    this.splitId = `split_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    this.isParsing = true
    this.receiptImage = imageSrc
    this.saveToLocalStorage()

    const isTest = import.meta.env.MODE === 'test'
    if (!isTest && !imageSrc.startsWith('demo_image_uri_')) {
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

        this.items = template.items.map((item, idx) => {
          const qty = (item as any).quantity || 1
          return {
            id: `item_${Date.now()}_${idx}`,
            name: item.name,
            price: item.price,
            assignedTo: [],
            quantity: qty,
            assignedQuantities: {},
            isSplitEvenly: qty > 1 ? true : undefined
          }
        })
        
        this.adjustments = [
          { id: `adj_${Date.now()}_0`, name: 'Tax / VAT', value: template.tax }
        ]
        this.tipInput = 0
        this.tipType = 'percentage'
        
        this.isParsing = false
        this.decrementSimulatedScan()
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
    if (this.usageInfo && !this.usageInfo.passType && this.usageInfo.freeScansRemaining <= 0) {
      this.showPaywall = true
      this.ocrError = 'Scan limit reached. Upgrade to continue!'
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const isNative = Capacitor.isNativePlatform()
      let resJson: any

      // If we are in local development (Vite) and have an API key, we can make the Gemini API call directly from the browser.
      // In production/native platforms, we call the backend Vercel serverless function.
      if (!isNative && import.meta.env.DEV && import.meta.env.MODE !== 'test') {
        if (!this.apiKey) {
          throw new Error('Gemini API key is not configured in .env')
        }

        const match = imageSrc.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
        if (!match) {
          throw new Error('Invalid image format. Expected base64 data URL.')
        }
        const mimeType = match[1]
        const base64Data = match[2]

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`
        const geminiPayload = {
          contents: [
            {
              parts: [
                {
                  text: `You are an expert receipt parser. Analyze this receipt and return a clean JSON object.
Follow these rules strictly:
1. Extract the merchant/restaurant name and target date if present.
2. Extract all individual line items (name, total price, quantity count). If an item has a quantity/count specified (e.g. '3 - Beer : 15$'), return the quantity as 3, and the price as the total line price ($15.00). If no quantity is specified, default to 1.
3. Do NOT include tax, service charges, VAT, or card fees in the items list.
4. Extract tax, service charge, card fee, or roundings as individual entries in an adjustments array:
   Example: [{"name": "Tax", "value": 3.50}, {"name": "Service Charge", "value": 5.00}]
5. Extract the tip value (if specified on the receipt).
6. Validate if the image is a valid receipt. If it's a photo of something else (like a dog, a car, landscape, blank screen, or arbitrary text), return a JSON with error: "This image does not appear to be a valid receipt."

Return format must be EXACTLY this JSON structure:
{
  "restaurant": "Restaurant Name",
  "date": "YYYY-MM-DD",
  "items": [
    {"name": "Item Name", "price": 10.50, "quantity": 3}
  ],
  "adjustments": [
    {"name": "Tax/VAT/Service Charge Name", "value": 1.50}
  ],
  "tip": 5.00
}`
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini API returned status ${response.status}: ${errorText}`)
        }

        resJson = await response.json()
      } else {
        const apiBase = isNative ? 'https://splat-chi.vercel.app' : ''
        const deviceId = await getDeviceId()
        const response = await fetch(`${apiBase}/api/ocr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageSrc, deviceId }),
          signal: controller.signal
        })

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}))
          throw new Error(errJson.error || `Serverless Error: Status ${response.status}`)
        }

        resJson = await response.json()
      }
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('Gemini API returned an empty response.')
      }

      const result = JSON.parse(text)
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      this.category = result.category || 'food_drink'

      this.items = (result.items || []).map((item: any, idx: number) => {
        const qty = Number(item.quantity) || 1
        let isSplitEvenly = undefined
        if (this.category === 'transport_fuel' || this.category === 'lodging') {
          isSplitEvenly = true
        } else if (this.category === 'tickets_entertainment') {
          isSplitEvenly = false
        } else if (qty > 1) {
          isSplitEvenly = true
        }

        return {
          id: `item_${Date.now()}_${idx}`,
          name: item.name || 'Unknown Item',
          price: Number(item.price) || 0,
          assignedTo: [],
          quantity: qty,
          assignedQuantities: {},
          isSplitEvenly: isSplitEvenly
        }
      })
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
      this.decrementSimulatedScan()
      this.step = 'edit'
    } catch (e: any) {
      console.error(e)
      if (e.message && e.message.includes('RATE_LIMIT_EXCEEDED')) {
        this.ocrError = 'Rate limit reached (max 4 scans per minute). Please wait a moment.'
      } else if (e.message && e.message.includes('LIMIT_EXCEEDED')) {
        this.showPaywall = true
        this.ocrError = 'Scan limit reached. Upgrade to continue!'
      } else if (e.name === 'AbortError') {
        this.ocrError = 'Request timed out after 30 seconds.'
      } else {
        this.ocrError = e.message || 'Failed to parse receipt'
      }
    } finally {
      clearTimeout(timeoutId)
      this.isParsing = false
      this.saveToLocalStorage()
    }
  },

  async fetchUsage() {
    this.fetchUsageCount++
    const currentCount = this.fetchUsageCount

    const fetched = await billingManager.fetchStatus(this.usageInfo)

    // Discard result if a newer fetch has started
    if (currentCount !== this.fetchUsageCount) {
      return
    }

    this.usageInfo = fetched
    this.simulatedUsage = billingManager.getSimulatedUsage()

    // Save updated usage details locally
    try {
      await setStorageItem('splat_usage_info', JSON.stringify(this.usageInfo))
    } catch (storageErr) {
      console.warn('Failed to save usage limits to storage', storageErr)
    }
  },

  setSimulatedUsage(passType: 'trip' | 'yearly' | null, freeScansUsed: number) {
    const usage = billingManager.setSimulatedUsage(passType, freeScansUsed)
    this.simulatedUsage = usage
    this.usageInfo = { ...usage }
    setStorageItem('splat_simulated_usage', JSON.stringify(usage))
  },

  clearSimulatedUsage() {
    billingManager.clearSimulatedUsage()
    this.simulatedUsage = null
    if (Capacitor.isNativePlatform()) {
      Preferences.remove({ key: 'splat_simulated_usage' })
    } else {
      localStorage.removeItem('splat_simulated_usage')
    }
    this.fetchUsage()
  },

  decrementSimulatedScan() {
    if (this.simulatedUsage) {
      if (this.simulatedUsage.passType) return
      const newUsed = this.simulatedUsage.freeScansUsed + 1
      this.setSimulatedUsage(null, newUsed)
    }
  },

  addParticipant(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.participants.push({ id, name: trimmed })
    
    // Auto-assign new participant to items that are currently assigned to everyone
    this.items.forEach(item => {
      if (!item.assignedQuantities) item.assignedQuantities = {}
      if (item.assignedTo.length > 0) {
        const allPrev = this.participants.slice(0, -1).map(p => p.id)
        const isEveryoneAssigned = allPrev.every(pId => item.assignedTo.includes(pId))
        if (isEveryoneAssigned) {
          item.assignedTo.push(id)
          item.assignedQuantities[id] = 1
        }
      }
    })
    this.saveToLocalStorage()
  },

  removeParticipant(id: string) {
    this.participants = this.participants.filter(p => p.id !== id)
    this.items.forEach(item => {
      item.assignedTo = item.assignedTo.filter(pId => pId !== id)
      if (item.assignedQuantities) {
        delete item.assignedQuantities[id]
      }
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
        const aq = item.assignedQuantities
        if (aq) {
          Object.keys(aq).forEach(pId => {
            if (!keptIds.includes(pId)) {
              delete aq[pId]
            }
          })
        }
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

  addItem(name = 'New Item', price = 0, quantity = 1) {
    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const assignedQuantities: Record<string, number> = {}
    const assignedTo = this.participants.map(p => p.id)
    if (quantity === 1) {
      assignedTo.forEach(pId => {
        assignedQuantities[pId] = 1
      })
    }
    this.items.push({ 
      id, 
      name, 
      price, 
      assignedTo, 
      quantity, 
      assignedQuantities,
      isSplitEvenly: quantity > 1 ? true : undefined
    })
    this.saveToLocalStorage()
  },

  removeItem(id: string) {
    this.items = this.items.filter(item => item.id !== id)
    this.saveToLocalStorage()
  },

  toggleItemAssignment(itemId: string, participantId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    
    if (!item.assignedQuantities) item.assignedQuantities = {}
    
    const index = item.assignedTo.indexOf(participantId)
    if (index > -1) {
      item.assignedTo.splice(index, 1)
      delete item.assignedQuantities[participantId]
    } else {
      item.assignedTo.push(participantId)
      item.assignedQuantities[participantId] = 1
    }
    this.saveToLocalStorage()
  },

  assignAllToItem(itemId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    item.assignedTo = this.participants.map(p => p.id)
    if (!item.assignedQuantities) item.assignedQuantities = {}
    this.participants.forEach(p => {
      item.assignedQuantities![p.id] = 1
    })
    this.saveToLocalStorage()
  },

  clearAllFromItem(itemId: string) {
    const item = this.items.find(i => i.id === itemId)
    if (!item) return
    item.assignedTo = []
    item.assignedQuantities = {}
    this.saveToLocalStorage()
  },

  autoAssignUnallocatedItems() {
    this.items.forEach(item => {
      if (item.assignedTo.length === 0) {
        this.assignAllToItem(item.id)
        if (item.quantity > 1) {
          item.isSplitEvenly = true
        }
      }
    })
  },


  async saveToLocalStorage(isChange = true) {
    if (isChange) {
      this.isModified = true
    }
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
        currencySymbol: this.currencySymbol,
        category: this.category,
        isModified: this.isModified
      }
      await setStorageItem('splat_store', JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save to localStorage', e)
    }
  },

  async loadFromLocalStorage() {
    try {
      if (Capacitor.isNativePlatform() || import.meta.env.PROD) {
        this.clearSimulatedUsage()
      } else {
        const simUsageStr = await getStorageItem('splat_simulated_usage')
        if (simUsageStr) {
          const parsed = JSON.parse(simUsageStr)
          this.simulatedUsage = parsed
          this.usageInfo = { ...parsed }
          billingManager.setSimulatedUsage(parsed.passType, parsed.freeScansUsed)
        } else {
          const usageStr = await getStorageItem('splat_usage_info')
          if (usageStr) {
            this.usageInfo = JSON.parse(usageStr)
          }
        }
      }
      
      const dataStr = await getStorageItem('splat_store')
      if (!dataStr) return
      const data = JSON.parse(dataStr)
      // Always open on home page (capture step) on cold start
      // Intentionally skip restoring data.step
      if (data.receiptImage !== undefined) this.receiptImage = data.receiptImage
      if (data.splitId) this.splitId = data.splitId
      if (data.billName) this.billName = data.billName
      if (data.items) {
        this.items = data.items.map((item: any) => {
          const qty = Number(item.quantity) || 1
          const assignedQ: Record<string, number> = item.assignedQuantities || {}
          if (qty === 1 && Object.keys(assignedQ).length === 0 && item.assignedTo) {
            item.assignedTo.forEach((pId: string) => {
              assignedQ[pId] = 1
            })
          }
          return {
            ...item,
            quantity: qty,
            assignedQuantities: assignedQ,
            isSplitEvenly: !!item.isSplitEvenly
          }
        })
      }
      if (data.participants) this.participants = data.participants
      if (data.adjustments) this.adjustments = data.adjustments
      if (data.tipInput !== undefined) this.tipInput = Number(data.tipInput) || 0
      if (data.tipType) this.tipType = data.tipType
      if (data.currencySymbol) this.currencySymbol = data.currencySymbol
      if (data.category) this.category = data.category
      if (data.isModified !== undefined) this.isModified = data.isModified
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
      
      // Save compressed image if exists
      if (this.receiptImage) {
        try {
          const compressed = await compressAndResizeImage(this.receiptImage)
          await setStorageItem(`splat_image_${this.splitId}`, compressed)
        } catch (imgError) {
          console.warn('Failed to compress/save history image', imgError)
        }
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
    
    // Load image from separate key
    try {
      const img = await getStorageItem(`splat_image_${split.splitId}`)
      this.receiptImage = img
    } catch (e) {
      console.warn('Failed to load history image from storage', e)
      this.receiptImage = null
    }

    this.step = 'share'
    this.isModified = false
    await this.saveToLocalStorage(false)
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
    const qty = Number(item.quantity) || 1
    
    if (qty > 1 && !item.isSplitEvenly) {
      const assignedQ = item.assignedQuantities || {}
      Object.entries(assignedQ).forEach(([pId, assignedCount]) => {
        if (subtotals[pId] !== undefined && assignedCount > 0) {
          subtotals[pId] += (assignedCount / qty) * price
        }
      })
    } else {
      const assignees = item.assignedTo.length > 0 ? item.assignedTo : activeParticipants.map(p => p.id)
      const share = price / assignees.length
      assignees.forEach(pId => {
        if (subtotals[pId] !== undefined) {
          subtotals[pId] += share
        }
      })
    }
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
    const totalRounded = Math.max(0, Math.round((individualSubtotal + taxShare + tipShare) * 100) / 100)
    
    calculatedGrandTotal += totalRounded

    // Build participant item shares
    const participantItems: { name: string; sharePrice: number }[] = []
    activeItems.forEach(item => {
      const price = Number(item.price) || 0
      const qty = Number(item.quantity) || 1
      
      if (qty > 1 && !item.isSplitEvenly) {
        const assignedQ = item.assignedQuantities || {}
        const count = assignedQ[p.id] || 0
        if (count > 0) {
          participantItems.push({
            name: `${count}x ${item.name}`,
            sharePrice: Math.round(((count / qty) * price) * 100) / 100
          })
        }
      } else {
        const assignees = item.assignedTo.length > 0 ? item.assignedTo : activeParticipants.map(pr => pr.id)
        if (assignees.includes(p.id)) {
          const suffix = (qty > 1 && item.isSplitEvenly) ? ' (Shared)' : ''
          participantItems.push({
            name: `${item.name}${suffix}`,
            sharePrice: Math.round((price / assignees.length) * 100) / 100
          })
        }
      }
    })

    return {
      id: p.id,
      name: p.name,
      subtotal: subtotalRounded,
      tax: taxRounded,
      tip: tipRounded,
      total: totalRounded,
      items: participantItems
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
  
  let text = `💸 Splat split: ${store.billName} 💸\n\n`
  
  breakdown.forEach(p => {
    text += `👤 ${p.name} owes: ${currency}${p.total.toFixed(2)}\n`
    text += `   ↳ Subtotal: ${currency}${p.subtotal.toFixed(2)}\n`
    if (p.items && p.items.length > 0) {
      p.items.forEach((item: any) => {
        text += `     - ${item.name} (${currency}${item.sharePrice.toFixed(2)})\n`
      })
    }
    if (p.tax !== 0) text += `   ↳ Adjustments/Fees: ${currency}${p.tax.toFixed(2)}\n`
    if (p.tip > 0) text += `   ↳ Tip: ${currency}${p.tip.toFixed(2)}\n`
    text += `\n`
  })
  
  text += `---------------------------\n`
  text += `🧾 Subtotal: ${currency}${itemsSubtotal.value.toFixed(2)}\n`
  
  store.adjustments.forEach(adj => {
    if (adj.value !== 0) {
      text += `🏛️ ${adj.name}: ${currency}${adj.value.toFixed(2)}\n`
    }
  })
  
  if (tipAmount.value > 0) text += `💡 Tip: ${currency}${tipAmount.value.toFixed(2)}\n`
  text += `💰 Total Bill: ${currency}${totalBill.value.toFixed(2)}\n\n`
  text += `Split proportionally using Splat!`
  
  return text
})

export function calculateSplitBreakdown(split: any) {
  const activeParticipants = split.participants || []
  const activeItems = split.items || []
  
  // 1. Calculate items subtotal
  const itemsSubtotalVal = activeItems.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0)
  
  // 2. Calculate adjustments
  const adjustments = split.adjustments || []
  const totalAdjustmentsVal = adjustments.reduce((sum: number, adj: any) => {
    const val = Number(adj.value) || 0
    if (adj.type === 'percent' || adj.type === 'percentage') {
      return sum + (itemsSubtotalVal * (val / 100))
    }
    return sum + val
  }, 0)

  // 3. Calculate tip
  const tipInput = split.tipInput || 0
  const tipType = split.tipType || 'percent'
  const tipAmountVal = (tipType === 'percent' || tipType === 'percentage')
    ? itemsSubtotalVal * (Number(tipInput) / 100) 
    : Number(tipInput)

  // 4. Calculate total bill
  const totalBillVal = itemsSubtotalVal + totalAdjustmentsVal + tipAmountVal

  if (activeParticipants.length === 0) return []

  const subtotals: Record<string, number> = {}
  activeParticipants.forEach((p: any) => { subtotals[p.id] = 0 })

  activeItems.forEach((item: any) => {
    const price = Number(item.price) || 0
    const qty = Number(item.quantity) || 1
    
    if (qty > 1 && !item.isSplitEvenly) {
      const assignedQ = item.assignedQuantities || {}
      Object.entries(assignedQ).forEach(([pId, assignedCount]) => {
        if (subtotals[pId] !== undefined && (assignedCount as number) > 0) {
          subtotals[pId] += ((assignedCount as number) / qty) * price
        }
      })
    } else {
      const assignees = item.assignedTo.length > 0 ? item.assignedTo : activeParticipants.map((p: any) => p.id)
      const share = price / assignees.length
      assignees.forEach((pId: string) => {
        if (subtotals[pId] !== undefined) {
          subtotals[pId] += share
        }
      })
    }
  })

  let calculatedGrandTotal = 0
  const list = activeParticipants.map((p: any) => {
    const individualSubtotal = subtotals[p.id]
    const ratio = itemsSubtotalVal > 0 ? individualSubtotal / itemsSubtotalVal : 1 / activeParticipants.length
    
    const taxShare = totalAdjustmentsVal * ratio
    const tipShare = tipAmountVal * ratio
    
    const subtotalRounded = Math.round(individualSubtotal * 100) / 100
    const taxRounded = Math.round(taxShare * 100) / 100
    const tipRounded = Math.round(tipShare * 100) / 100
    const totalRounded = Math.max(0, Math.round((individualSubtotal + taxShare + tipShare) * 100) / 100)
    
    calculatedGrandTotal += totalRounded

    // Build participant item shares
    const participantItems: { name: string; sharePrice: number }[] = []
    activeItems.forEach((item: any) => {
      const price = Number(item.price) || 0
      const qty = Number(item.quantity) || 1
      
      if (qty > 1 && !item.isSplitEvenly) {
        const assignedQ = item.assignedQuantities || {}
        const count = assignedQ[p.id] || 0
        if (count > 0) {
          participantItems.push({
            name: `${count}x ${item.name}`,
            sharePrice: Math.round(((count / qty) * price) * 100) / 100
          })
        }
      } else {
        const assignees = item.assignedTo.length > 0 ? item.assignedTo : activeParticipants.map((pr: any) => pr.id)
        if (assignees.includes(p.id)) {
          const suffix = (qty > 1 && item.isSplitEvenly) ? ' (Shared)' : ''
          participantItems.push({
            name: `${item.name}${suffix}`,
            sharePrice: Math.round((price / assignees.length) * 100) / 100
          })
        }
      }
    })

    return {
      id: p.id,
      name: p.name,
      subtotal: subtotalRounded,
      tax: taxRounded,
      tip: tipRounded,
      total: totalRounded,
      items: participantItems
    }
  })

  // Penny rounding error correction
  const roundingError = Math.round((totalBillVal - calculatedGrandTotal) * 100) / 100
  if (roundingError !== 0 && list.length > 0) {
    let maxIdx = 0
    let maxSub = -1
    list.forEach((p: any, idx: number) => {
      if (p.subtotal > maxSub) {
        maxSub = p.subtotal
        maxIdx = idx
      }
    })
    list[maxIdx].total = Math.round((list[maxIdx].total + roundingError) * 100) / 100
  }

  return list
}

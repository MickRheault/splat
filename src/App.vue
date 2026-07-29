<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Dialog from 'primevue/dialog'

// Import Capacitor Core & Plugins
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Share } from '@capacitor/share'
import { Clipboard } from '@capacitor/clipboard'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { SplashScreen } from '@capacitor/splash-screen'
import { App } from '@capacitor/app'
import { billingManager } from './services/billing'
import { API_BASE_URL, UPDATE_MANIFEST_URL } from './config'

// Import reactive store and computed properties
import { 
  store, 
  itemsSubtotal, 
  tipAmount, 
  totalBill, 
  billBreakdown, 
  shareTextSummary,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  getDeviceId,
  calculateSplitBreakdown
} from './store'
import pkg from '../package.json'

const appVersion = ref(pkg.version || '0.0.0')

const formatPassDate = (isoString: string | null | undefined) => {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}



// Local UI states
const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)

const copySuccess = ref(false)
const showOriginalBill = ref(false)
const showFullNames = true

// Original Bill Zoom & Pan State
const zoomScale = ref(1.0)
const panX = ref(0)
const panY = ref(0)

let isDraggingBill = false
let startDragX = 0
let startDragY = 0

const zoomIn = () => {
  zoomScale.value = Math.min(3.0, zoomScale.value + 0.25)
}

const zoomOut = () => {
  zoomScale.value = Math.max(0.5, zoomScale.value - 0.25)
  if (zoomScale.value <= 1.0) {
    panX.value = 0
    panY.value = 0
  }
}

const resetZoom = () => {
  zoomScale.value = 1.0
  panX.value = 0
  panY.value = 0
}

const onPointerDown = (e: PointerEvent) => {
  if (zoomScale.value <= 1.0) return
  isDraggingBill = true
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  startDragX = e.clientX - panX.value
  startDragY = e.clientY - panY.value
}

const onPointerMove = (e: PointerEvent) => {
  if (!isDraggingBill) return
  const rawX = e.clientX - startDragX
  const rawY = e.clientY - startDragY
  
  const maxPanX = 150 * (zoomScale.value - 1)
  const maxPanY = 300 * (zoomScale.value - 1)
  
  panX.value = Math.max(-maxPanX, Math.min(maxPanX, rawX))
  panY.value = Math.max(-maxPanY, Math.min(maxPanY, rawY))
}

const onPointerUp = (e: PointerEvent) => {
  if (!isDraggingBill) return
  isDraggingBill = false
  const target = e.currentTarget as HTMLElement
  try {
    target.releasePointerCapture(e.pointerId)
  } catch (err) {}
}

watch(showOriginalBill, (newVal) => {
  if (!newVal) {
    resetZoom()
  }
})

// Person detail popup state (Step 4)
const isPersonDetailOpen = ref(false)
const selectedBreakdownPerson = ref<any>(null)

const openPersonDetail = (person: any) => {
  selectedBreakdownPerson.value = person
  isPersonDetailOpen.value = true
}

const personShareText = computed(() => {
  const p = selectedBreakdownPerson.value
  if (!p) return ''
  const currency = store.currencySymbol
  let text = `💸 ${p.name}'s split for ${store.billName}\n\n`
  text += `👤 ${p.name} owes ${currency}${p.total.toFixed(2)}\n`
  if (p.items && p.items.length > 0) {
    p.items.forEach((item: any) => {
      text += `  - ${item.name}: ${currency}${item.sharePrice.toFixed(2)}\n`
    })
  }
  if (p.tax !== 0) text += `  ↳ Adjustments/Fees: ${currency}${p.tax.toFixed(2)}\n`
  if (p.tip > 0) text += `  ↳ Tip: ${currency}${p.tip.toFixed(2)}\n`
  text += `\nSplit using Splat!`
  return text
})

// History List State
const savedSplits = ref<any[]>([])
const showAllHistory = ref(false)

const visibleSplits = computed(() => {
  if (showAllHistory.value) {
    return savedSplits.value
  }
  return savedSplits.value.slice(0, 3)
})

const loadHistoryFromStorage = async () => {
  try {
    const historyStr = await getStorageItem('splat_history') || '[]'
    savedSplits.value = JSON.parse(historyStr)
  } catch (e) {
    console.error('Failed to load history list', e)
  }
}

// Custom Name Picker State
const isQuickPickerOpen = ref(false)
const activePickerParticipantId = ref<string | null>(null)
const savedCustomNames = ref<string[]>([])

const isScanLimitReached = computed(() => {
  return !!(store.usageInfo && !store.usageInfo.passType && store.usageInfo.freeScansRemaining <= 0)
})

const isOnline = ref(window.navigator.onLine)
window.addEventListener('online', () => { isOnline.value = true })
window.addEventListener('offline', () => { isOnline.value = false })

// Paywall / Subscription States
const selectedPaywallOption = ref<'trip' | 'yearly'>('yearly')
const isPurchasing = ref(false)

const handlePaywallPurchase = async () => {
  if (isPurchasing.value) return
  isPurchasing.value = true
  try {
    const option = selectedPaywallOption.value as 'trip' | 'yearly'
    await billingManager.purchase(option)
    
    // Sync entitlement state
    store.ocrError = null
    store.showPaywall = false
    await store.fetchUsage()
    alert(`Purchase Activated! Your ${option === 'trip' ? '14-Day Pass' : 'Yearly Pro'} plan is now active. Try scanning your receipt again!`)
  } catch (e: any) {
    console.error('Purchase failed:', e)
    if (e.userCancelled) {
      console.log('User cancelled purchase')
    } else {
      alert('Purchase failed:\n' + billingManager.formatError(e))
    }
  } finally {
    isPurchasing.value = false
  }
}

const handleRestorePurchases = async () => {
  if (isPurchasing.value) return
  isPurchasing.value = true
  try {
    const hasActivePass = await billingManager.restore()
    if (hasActivePass) {
      await store.fetchUsage()
      alert('Purchases restored successfully!')
      store.showPaywall = false
    } else {
      alert('No active entitlements found to restore.')
    }
  } catch (e: any) {
    console.error('Restore purchases failed:', e)
    alert('Restore failed:\n' + billingManager.formatError(e))
  } finally {
    isPurchasing.value = false
  }
}

// Developer Menu States
const versionTapCount = ref(0)
const isDevMenuOpen = ref(false)
const isPerformingDevAction = ref(false)
const localDeviceId = ref('')

const handleVersionTap = async () => {
  versionTapCount.value++
  if (versionTapCount.value >= 5) {
    versionTapCount.value = 0
    localDeviceId.value = await getDeviceId()
    isDevMenuOpen.value = true
  }
}

const handleDevAction = async (type: 'trip' | 'yearly' | 'reset') => {
  if (isPerformingDevAction.value) return
  isPerformingDevAction.value = true
  try {
    const isNative = Capacitor.isNativePlatform()
    const apiBase = isNative ? API_BASE_URL : ''
    const deviceId = await getDeviceId()

    // 1. Try to synchronize with Vercel backend KV database
    const response = await fetch(`${apiBase}/api/mock-purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, type })
    })

    if (response.ok) {
      await store.fetchUsage()
    }

    // 2. Register client-side simulation state
    if (type === 'reset') {
      store.clearSimulatedUsage()
      store.ocrError = null
      alert('Usage and active passes reset client and server-side!')
    } else {
      const currentUsed = store.simulatedUsage?.freeScansUsed || 0
      store.setSimulatedUsage(type, currentUsed)
      alert(`Simulated purchase success: Active ${type === 'trip' ? '14-Day' : 'Yearly'} pass registered client and server-side!`)
    }
    isDevMenuOpen.value = false
  } catch (err: any) {
    console.warn('Failed to sync dev action with server:', err)
    // Fall back to client-only simulation if server is offline or unreachable
    if (type === 'reset') {
      store.setSimulatedUsage(null, 0)
      store.ocrError = null
      alert('Simulated usage reset client-side (failed to sync with server).')
    } else {
      const currentUsed = store.simulatedUsage?.freeScansUsed || 0
      store.setSimulatedUsage(type, currentUsed)
      alert(`Simulated purchase success: Active ${type === 'trip' ? '14-Day' : 'Yearly'} pass registered client-side (failed to sync with server).`)
    }
    isDevMenuOpen.value = false
  } finally {
    isPerformingDevAction.value = false
  }
}

const loadSavedNames = async () => {
  try {
    const savedStr = await getStorageItem('splat_saved_names') || '[]'
    savedCustomNames.value = JSON.parse(savedStr)
  } catch (e) {
    console.error('Failed to load saved names', e)
  }
}

onMounted(async () => {
  const mountStart = performance.now();
  const getElapsed = () => {
    const base = (window as any).__bootstrapStart || mountStart;
    return (performance.now() - base).toFixed(1) + 'ms';
  };
  console.log('[PERF] App.vue onMounted started. Elapsed since bootstrap:', getElapsed());

  // 1. Load local persistent data concurrently (Non-blocking)
  const dbLoadStart = performance.now();
  const localDataPromise = Promise.all([
    store.loadFromLocalStorage(),
    loadHistoryFromStorage(),
    loadSavedNames()
  ]);

  // 2. Fetch usage metrics and entitlements in the background
  store.fetchUsage();

  // 3. Sync DB usage state when the phone app is resumed from background
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      store.fetchUsage()
    }
  })

  // 4. Wait for local storage data to finish loading BEFORE hiding splash screen
  await localDataPromise;
  console.log(`[PERF] Local database loaded in ${(performance.now() - dbLoadStart).toFixed(1)}ms. Total elapsed:`, getElapsed());

  // 5. Notify Capgo updater and hide native splash screen when ready
  if (Capacitor.isNativePlatform()) {
    const capReadyStart = performance.now();
    try {
      await CapacitorUpdater.notifyAppReady()
      console.log(`[PERF] CapacitorUpdater notifyAppReady done in ${(performance.now() - capReadyStart).toFixed(1)}ms. Total elapsed:`, getElapsed());
    } catch (e) {
      console.warn('CapacitorUpdater notifyAppReady failed:', e)
    }

    const splashHideStart = performance.now();
    try {
      await SplashScreen.hide()
      console.log(`[PERF] SplashScreen hide done in ${(performance.now() - splashHideStart).toFixed(1)}ms. Total elapsed:`, getElapsed());
    } catch (e) {
      console.warn('SplashScreen hide failed:', e)
    }

    // Run background update checks without blocking startup
    (async () => {
      try {
        const response = await fetch(UPDATE_MANIFEST_URL)
        if (response.ok) {
          const manifest = await response.json()
          
          // Get current active version
          const currentInfo = await CapacitorUpdater.current()
          const currentVersion = currentInfo.bundle.id === 'builtin' ? currentInfo.native : currentInfo.bundle.version
          appVersion.value = currentVersion

          // Compare and download update in the background if version is new
          if (manifest.version && manifest.version !== currentVersion) {
            const versionInfo = await CapacitorUpdater.download({
              url: manifest.url,
              version: manifest.version
            })
            
            // Queue the update to be activated on next app launch/restart
            await CapacitorUpdater.next(versionInfo)
            console.log(`CapacitorUpdater: Downloaded version ${manifest.version}, queued for next restart.`)
          }
        }
      } catch (e) {
        console.warn('CapacitorUpdater background update check failed:', e)
      }
    })();

    // Handle native hardware back button presses
    if (Capacitor.isNativePlatform()) {
      App.addListener('backButton', () => {
        if (store.step !== 'capture') {
          goBack()
        } else {
          App.exitApp()
        }
      });

      // Configure and initialize RevenueCat Purchases SDK
      (async () => {
        try {
          await billingManager.initialize()
          await store.fetchUsage()
        } catch (err) {
          console.warn('RevenueCat initialization failed:', err)
        }
      })()
    }
  }
})

const onParticipantNameChanged = async (name: string) => {
  await store.saveToLocalStorage()
  
  const trimmed = name.trim()
  if (!trimmed) return
  if (/^Person\s*\d+$/i.test(trimmed)) return // Ignore default Person 1, etc.
  
  if (!savedCustomNames.value.includes(trimmed)) {
    savedCustomNames.value.push(trimmed)
    await setStorageItem('splat_saved_names', JSON.stringify(savedCustomNames.value))
  }
}

const openQuickPicker = (participantId: string) => {
  activePickerParticipantId.value = participantId
  isQuickPickerOpen.value = true
}

const applyQuickName = async (name: string) => {
  if (activePickerParticipantId.value) {
    const p = store.participants.find(part => part.id === activePickerParticipantId.value)
    if (p) {
      p.name = name
      await store.saveToLocalStorage()
    }
  }
  isQuickPickerOpen.value = false
}

// Auto-save history when share step is reached
watch(() => store.step, async (newStep) => {
  if (newStep === 'share') {
    await store.saveToHistory()
    await loadHistoryFromStorage()
  }
})

const isHistoryDetailOpen = ref(false)
const selectedHistorySplit = ref<any | null>(null)

const historyDetailBreakdown = computed(() => {
  if (!selectedHistorySplit.value) return []
  return calculateSplitBreakdown(selectedHistorySplit.value)
})

const loadSavedSplit = (split: any) => {
  selectedHistorySplit.value = split
  isHistoryDetailOpen.value = true
}

const confirmRestoreSplit = async (targetStep: 'edit' | 'share') => {
  if (!selectedHistorySplit.value) return
  
  const hasActiveItems = store.items.length > 0
  const isDifferentSplit = store.splitId !== selectedHistorySplit.value.splitId
  
  if (hasActiveItems && isDifferentSplit) {
    if (!window.confirm("You have an active split in progress. Loading this split will overwrite it. Proceed?")) {
      return
    }
  }
  
  await store.loadSplit(selectedHistorySplit.value)
  if (targetStep === 'edit') {
    store.step = 'edit'
  } else {
    store.step = 'share'
  }
  isHistoryDetailOpen.value = false
}

const clearHistory = async () => {
  if (window.confirm("Are you sure you want to clear your saved splits history?")) {
    for (const split of savedSplits.value) {
      await removeStorageItem(`splat_image_${split.splitId}`)
    }
    await removeStorageItem('splat_history')
    savedSplits.value = []
  }
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Item allocation modal states
const isAllocationOpen = ref(false)
const selectedItemId = ref<string | null>(null)

const selectedItem = computed(() => {
  if (!selectedItemId.value) return null
  return store.items.find(item => item.id === selectedItemId.value) || null
})

// Edit Item details modal state
const isEditItemOpen = ref(false)
const editingItemId = ref<string | null>(null)
const editingItemName = ref('')
const editingItemPrice = ref(0)
const editingItemQuantity = ref(1)

const openEditItemModal = (itemId: string) => {
  const item = store.items.find(i => i.id === itemId)
  if (!item) return
  editingItemId.value = itemId
  editingItemName.value = item.name
  editingItemPrice.value = item.price
  editingItemQuantity.value = item.quantity || 1
  isEditItemOpen.value = true
}

const saveEditItem = () => {
  if (!editingItemId.value) return
  const item = store.items.find(i => i.id === editingItemId.value)
  if (item) {
    item.name = editingItemName.value
    item.price = Number(editingItemPrice.value) || 0
    
    const prevQty = item.quantity
    const newQty = Math.max(1, Math.floor(Number(editingItemQuantity.value) || 1))
    item.quantity = newQty
    
    if (!item.assignedQuantities) item.assignedQuantities = {}
    
    if (newQty === 1) {
      item.assignedQuantities = {}
      item.assignedTo.forEach(pId => {
        item.assignedQuantities![pId] = 1
      })
      item.isSplitEvenly = undefined
    } else if (newQty !== prevQty) {
      if (item.isSplitEvenly === undefined) {
        item.isSplitEvenly = true
      }
      if (item.assignedTo.length === 0) {
        item.assignedTo = store.participants.map(p => p.id)
      }
    }
    store.saveToLocalStorage()
  }
  isEditItemOpen.value = false
  editingItemId.value = null
}

// Quantity-based allocation helpers
const getRemainingQuantity = (item: any) => {
  if (!item) return 0
  const qty = item.quantity || 1
  const assigned = Object.values(item.assignedQuantities || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
  return Math.max(0, qty - assigned)
}

const incrementAssignment = (itemId: string, participantId: string) => {
  const item = store.items.find(i => i.id === itemId)
  if (!item) return
  if (!item.assignedQuantities) item.assignedQuantities = {}
  
  const remaining = getRemainingQuantity(item)
  if (remaining <= 0) return
  
  const current = item.assignedQuantities[participantId] || 0
  item.assignedQuantities[participantId] = current + 1
  
  if (!item.assignedTo.includes(participantId)) {
    item.assignedTo.push(participantId)
  }
  store.saveToLocalStorage()
}

const decrementAssignment = (itemId: string, participantId: string) => {
  const item = store.items.find(i => i.id === itemId)
  if (!item) return
  if (!item.assignedQuantities) return
  
  const current = item.assignedQuantities[participantId] || 0
  if (current <= 0) return
  
  // If current is less than or equal to 1, decrementing deletes it
  if (current <= 1) {
    delete item.assignedQuantities[participantId]
    item.assignedTo = item.assignedTo.filter(pId => pId !== participantId)
  } else {
    item.assignedQuantities[participantId] = Math.max(0, current - 1)
  }
  store.saveToLocalStorage()
}

const onAllocationValueInput = (itemId: string, participantId: string, event: Event) => {
  const item = store.items.find(i => i.id === itemId)
  if (!item) return
  if (!item.assignedQuantities) item.assignedQuantities = {}
  
  const target = event.target as HTMLInputElement
  const rawValue = parseFloat(target.value)
  const value = isNaN(rawValue) ? 0 : rawValue
  
  const otherAssignedSum = Object.entries(item.assignedQuantities)
    .filter(([pId]) => pId !== participantId)
    .reduce((sum, [, val]) => sum + (Number(val) || 0), 0)
    
  const maxAllowed = Math.max(0, (item.quantity || 1) - otherAssignedSum)
  const clampedValue = Math.min(maxAllowed, Math.max(0, value))
  
  if (clampedValue > 0) {
    item.assignedQuantities[participantId] = clampedValue
    if (!item.assignedTo.includes(participantId)) {
      item.assignedTo.push(participantId)
    }
  } else {
    delete item.assignedQuantities[participantId]
    item.assignedTo = item.assignedTo.filter(pId => pId !== participantId)
  }
  
  target.value = String(clampedValue)
  store.saveToLocalStorage()
}

// Allocation validation helpers
const isItemFullyAllocated = (item: any) => {
  if (!item) return false
  const qty = item.quantity || 1
  if (qty === 1 || item.isSplitEvenly) {
    return item.assignedTo.length > 0
  }
  const assigned = Object.values(item.assignedQuantities || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
  return assigned === qty
}

const hasAllocationErrors = computed(() => {
  return store.items.some(item => !isItemFullyAllocated(item))
})

const toggleSplitEvenly = (item: any) => {
  if (!item) return
  item.isSplitEvenly = !item.isSplitEvenly
  
  if (item.isSplitEvenly) {
    item.assignedQuantities = {}
  } else {
    item.assignedQuantities = {}
    item.assignedTo = []
  }
  store.saveToLocalStorage()
}

const captureNativeImage = async (source: CameraSource) => {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: source
    })
    if (image.base64String) {
      const mimeType = `image/${image.format}`
      const dataUrl = `data:${mimeType};base64,${image.base64String}`
      store.simulateOCR(dataUrl)
    }
  } catch (e) {
    console.warn('Native camera capture cancelled or failed', e)
  }
}

const checkConfirmDataLoss = () => {
  if (store.items.length > 0 || store.participants.length > 0) {
    return confirm('Are you sure you want to discard your current split?')
  }
  return true
}

// Trigger native device camera
const triggerCamera = () => {
  if (!checkConfirmDataLoss()) return
  if (!isOnline.value) {
    alert('Network Connection Required to Scan. Tap "Manual" instead.')
    return
  }
  if (isScanLimitReached.value) {
    store.showPaywall = true
    return
  }
  if (Capacitor.isNativePlatform()) {
    captureNativeImage(CameraSource.Camera)
  } else if (cameraInput.value) {
    cameraInput.value.click()
  }
}

// Trigger gallery file picker
const triggerGallery = () => {
  if (!checkConfirmDataLoss()) return
  if (!isOnline.value) {
    alert('Network Connection Required to Scan. Tap "Manual" instead.')
    return
  }
  if (isScanLimitReached.value) {
    store.showPaywall = true
    return
  }
  if (Capacitor.isNativePlatform()) {
    captureNativeImage(CameraSource.Photos)
  } else if (galleryInput.value) {
    galleryInput.value.click()
  }
}

// Handle file capture
const onFileCaptured = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUri = e.target?.result as string
      store.simulateOCR(dataUri)
    }
    reader.readAsDataURL(file)
  }
}

// Select a demo template to quickly test the app
const loadDemoReceipt = (index: number) => {
  if (!checkConfirmDataLoss()) return
  store.simulateOCR(`demo_image_uri_${index}`)
}

// Start splitting manually by skipping OCR and initializing a blank item
const startManualEntry = () => {
  if (!checkConfirmDataLoss()) return
  store.reset()
  store.step = 'edit'
  store.addItem('New Item', 0)
}

const onCategoryChanged = () => {
  store.items.forEach(item => {
    const qty = Number(item.quantity) || 1
    if (store.category === 'transport_fuel' || store.category === 'lodging') {
      item.isSplitEvenly = true
    } else if (store.category === 'tickets_entertainment') {
      item.isSplitEvenly = false
    } else if (qty > 1) {
      item.isSplitEvenly = true
    }
  })
  store.saveToLocalStorage()
}

// Custom select dropdown overlay sheet states and triggers
const isSelectorOpen = ref(false)
const selectorType = ref<'category' | 'currency' | null>(null)
const selectorTitle = ref('')
const selectorOptions = ref<{ value: any; label: string; icon?: string }[]>([])

const openCategorySelector = () => {
  selectorType.value = 'category'
  selectorTitle.value = 'Select Category'
  selectorOptions.value = [
    { value: 'food_drink', label: 'Food & Drink', icon: '🍔' },
    { value: 'groceries', label: 'Groceries', icon: '🛒' },
    { value: 'transport_fuel', label: 'Transport / Fuel', icon: '⛽' },
    { value: 'lodging', label: 'Lodging', icon: '🏨' },
    { value: 'tickets_entertainment', label: 'Tickets / Event', icon: '🎫' },
    { value: 'shopping', label: 'Shopping', icon: '🛍' },
    { value: 'activities', label: 'Activities', icon: '🏂' },
    { value: 'general', label: 'General / Other', icon: '⚙' }
  ]
  isSelectorOpen.value = true
}

const openCurrencySelector = () => {
  selectorType.value = 'currency'
  selectorTitle.value = 'Select Currency'
  selectorOptions.value = [
    { value: '$', label: 'US Dollar ($)' },
    { value: '€', label: 'Euro (€)' },
    { value: '£', label: 'Pound (£)' },
    { value: '฿', label: 'Thai Baht (฿)' },
    { value: '¥', label: 'Yen/Yuan (¥)' },
    { value: '₩', label: 'Won (₩)' }
  ]
  isSelectorOpen.value = true
}

const selectOption = (val: any) => {
  if (selectorType.value === 'category') {
    store.category = val
    onCategoryChanged()
  } else if (selectorType.value === 'currency') {
    store.currencySymbol = val
    store.saveToLocalStorage()
  }
  isSelectorOpen.value = false
}

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'food_drink': return '🍔 Food & Drink'
    case 'groceries': return '🛒 Groceries'
    case 'transport_fuel': return '⛽ Transport / Fuel'
    case 'lodging': return '🏨 Lodging'
    case 'tickets_entertainment': return '🎫 Tickets / Event'
    case 'shopping': return '🛍 Shopping'
    case 'activities': return '🏂 Activities'
    default: return '⚙ General / Other'
  }
}

const getCurrencyLabel = (symbol: string) => {
  switch (symbol) {
    case '$': return 'US Dollar ($)'
    case '€': return 'Euro (€)'
    case '£': return 'Pound (£)'
    case '฿': return 'Thai Baht (฿)'
    case '¥': return 'Yen/Yuan (¥)'
    case '₩': return 'Won (₩)'
    default: return symbol
  }
}


// Handle navigation validation
const isEditValid = computed(() => store.items.length > 0 && itemsSubtotal.value > 0)
const isParticipantsValid = computed(() => store.participants.length > 0)

const isStepSelectable = (targetStep: 'edit' | 'participants' | 'allocate' | 'share') => {
  if (targetStep === 'edit') return true
  if (targetStep === 'participants') return isEditValid.value
  if (targetStep === 'allocate') return isEditValid.value && isParticipantsValid.value
  if (targetStep === 'share') return isEditValid.value && isParticipantsValid.value && !hasAllocationErrors.value
  return false
}

const navigateToStep = (targetStep: 'edit' | 'participants' | 'allocate' | 'share') => {
  if (!isStepSelectable(targetStep)) return

  if (targetStep === 'allocate' || targetStep === 'share') {
    // Automatically assign everyone to unallocated single-quantity items
    store.autoAssignUnallocatedItems()
  }

  store.step = targetStep
}

const canGoNext = computed(() => {
  if (store.step === 'capture') {
    return false
  }
  if (store.step === 'edit') {
    return isEditValid.value
  }
  if (store.step === 'participants') {
    return isParticipantsValid.value
  }
  if (store.step === 'allocate') {
    return !hasAllocationErrors.value
  }
  return true
})

// Move step forward
const goNext = () => {
  if (!canGoNext.value) return

  if (store.step === 'capture') {
    store.step = 'edit'
  } else if (store.step === 'edit') {
    store.step = 'participants'
  } else if (store.step === 'participants') {
    store.step = 'allocate'
    // Automatically assign everyone to unallocated single-quantity items
    store.autoAssignUnallocatedItems()
  } else if (store.step === 'allocate') {
    store.step = 'share'
  }
}

// Move step backward
const goBack = () => {
  if (store.step === 'edit') {
    store.step = 'capture'
  } else if (store.step === 'participants') {
    store.step = 'edit'
  } else if (store.step === 'allocate') {
    store.step = 'participants'
  } else if (store.step === 'share') {
    store.step = 'allocate'
  }
}

// Reset app back to landing page
const handleReset = () => {
  const isHistoryBill = savedSplits.value.some(split => split.splitId === store.splitId)
  
  if (isHistoryBill) {
    if (store.isModified) {
      if (!confirm('Are you sure you want to discard your edits? The original saved bill in history will not be affected.')) {
        return
      }
    }
  } else {
    if (store.items.length > 0 || store.participants.length > 0) {
      if (!confirm('Are you sure you want to reset the current split? All items and participants will be deleted.')) {
        return
      }
    }
  }
  store.reset()
}

// Open allocation dialog for an item
const openAllocation = (itemId: string) => {
  selectedItemId.value = itemId
  isAllocationOpen.value = true
}

// Bulk Allocation State & Handlers
const isBulkMode = ref(false)
const bulkSelectedItems = ref<string[]>([])
const isBulkAssignOpen = ref(false)
const bulkSelectedParticipants = ref<string[]>([])

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressTriggered = false
let startX = 0
let startY = 0

const onItemPointerDown = (event: PointerEvent, itemId: string) => {
  startX = event.clientX
  startY = event.clientY
  longPressTriggered = false
  
  longPressTimer = setTimeout(() => {
    longPressTriggered = true
    enterBulkMode(itemId)
  }, 600) // 600ms hold triggers bulk selection mode
}

const onItemPointerUp = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

const onItemClick = (event: Event, itemId: string) => {
  if (longPressTriggered) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  
  if (isBulkMode.value) {
    toggleBulkItem(itemId)
  } else {
    openAllocation(itemId)
  }
}

const onItemPointerMove = (event: PointerEvent) => {
  if (longPressTimer) {
    const dx = Math.abs(event.clientX - startX)
    const dy = Math.abs(event.clientY - startY)
    if (dx > 8 || dy > 8) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }
}

const onItemPointerLeave = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

const enterBulkMode = (itemId: string) => {
  isBulkMode.value = true
  bulkSelectedItems.value = [itemId]
  if (navigator.vibrate) {
    navigator.vibrate(50)
  }
}

const toggleBulkItem = (itemId: string) => {
  const idx = bulkSelectedItems.value.indexOf(itemId)
  if (idx > -1) {
    bulkSelectedItems.value.splice(idx, 1)
  } else {
    bulkSelectedItems.value.push(itemId)
  }
  
  if (bulkSelectedItems.value.length === 0) {
    exitBulkMode()
  }
}

const exitBulkMode = () => {
  isBulkMode.value = false
  bulkSelectedItems.value = []
}

const selectAllItems = () => {
  bulkSelectedItems.value = store.items.map(item => item.id)
}

const toggleBulkParticipant = (pId: string) => {
  const idx = bulkSelectedParticipants.value.indexOf(pId)
  if (idx > -1) {
    bulkSelectedParticipants.value.splice(idx, 1)
  } else {
    bulkSelectedParticipants.value.push(pId)
  }
}

const bulkSelectEveryone = () => {
  bulkSelectedParticipants.value = store.participants.map(p => p.id)
}

const bulkClearEveryone = () => {
  bulkSelectedParticipants.value = []
}

const openBulkAssignDialog = () => {
  bulkSelectedParticipants.value = []
  isBulkAssignOpen.value = true
}

const applyBulkAssignment = () => {
  bulkSelectedItems.value.forEach(itemId => {
    const item = store.items.find(i => i.id === itemId)
    if (item) {
      item.assignedTo = [...bulkSelectedParticipants.value]
    }
  })
  store.saveToLocalStorage()
  isBulkAssignOpen.value = false
  exitBulkMode()
}

const clearBulkAssignments = () => {
  bulkSelectedItems.value.forEach(itemId => {
    const item = store.items.find(i => i.id === itemId)
    if (item) {
      item.assignedTo = []
    }
  })
  store.saveToLocalStorage()
  exitBulkMode()
}

// Format participant initials for circular badges
const getInitials = (name: string) => {
  return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'food_drink': return 'pi pi-utensils'
    case 'groceries': return 'pi pi-shopping-cart'
    case 'transport_fuel': return 'pi pi-car'
    case 'lodging': return 'pi pi-home'
    case 'tickets_entertainment': return 'pi pi-ticket'
    case 'shopping': return 'pi pi-shopping-bag'
    case 'activities': return 'pi pi-compass'
    default: return 'pi pi-cog'
  }
}

// Copy full summary to clipboard
const copyToClipboard = async () => {
  const text = shareTextSummary.value
  try {
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: text })
    } else {
      await navigator.clipboard.writeText(text)
    }
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to copy', e)
  }
}

// Share full summary via native share sheet
const shareToNative = async () => {
  const text = shareTextSummary.value
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: store.billName,
        text: text,
        dialogTitle: 'Share Split Summary'
      })
    } else if (navigator.share) {
      await navigator.share({ title: store.billName, text })
    } else {
      // Fallback: just copy
      await copyToClipboard()
    }
  } catch (e) {
    console.error('Failed to share', e)
  }
}

// Copy single person's breakdown to clipboard
const copyPersonToClipboard = async () => {
  const text = personShareText.value
  if (!text) return
  try {
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: text })
    } else {
      await navigator.clipboard.writeText(text)
    }
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to copy', e)
  }
}

// Share single person's breakdown via native share sheet
const sharePersonToNative = async () => {
  const text = personShareText.value
  const p = selectedBreakdownPerson.value
  if (!text || !p) return
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: `${p.name}'s split`,
        text: text,
        dialogTitle: `Share ${p.name}'s Split`
      })
    } else if (navigator.share) {
      await navigator.share({ title: `${p.name}'s split`, text })
    } else {
      await copyPersonToClipboard()
    }
  } catch (e) {
    console.error('Failed to share', e)
  }
}

// Select all text in an input on focus
const selectAllText = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target) {
    target.select()
  }
}
</script>

<template>
  <!-- Main Header Stepper -->
  <header class="app-header">
    <div class="brand-logo-container" v-if="store.step === 'capture'">
      <img src="/splat_logo.png?v=2" alt="SPLAT Logo" class="brand-logo" />
    </div>
    
    <!-- Step indicator visualization -->
    <div class="stepper" v-else-if="!store.isParsing" aria-label="Progress Stepper">
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'edit', 
          'completed': store.step !== 'edit',
          'selectable': isStepSelectable('edit')
        }"
        :aria-current="store.step === 'edit' ? 'step' : undefined"
        title="Step 1: Receipt Items"
        @click="navigateToStep('edit')"
      >
        <i v-if="store.step !== 'edit'" class="pi pi-check text-xs"></i>
        <span v-else>1</span>
      </div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'participants', 
          'completed': store.step !== 'edit' && store.step !== 'participants',
          'selectable': isStepSelectable('participants')
        }"
        :aria-current="store.step === 'participants' ? 'step' : undefined"
        title="Step 2: Participants"
        @click="navigateToStep('participants')"
      >
        <i v-if="store.step === 'allocate' || store.step === 'share'" class="pi pi-check text-xs"></i>
        <span v-else>2</span>
      </div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'allocate', 
          'completed': store.step === 'share',
          'selectable': isStepSelectable('allocate')
        }"
        :aria-current="store.step === 'allocate' ? 'step' : undefined"
        title="Step 3: Assign Items"
        @click="navigateToStep('allocate')"
      >
        <i v-if="store.step === 'share'" class="pi pi-check text-xs"></i>
        <span v-else>3</span>
      </div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'share',
          'selectable': isStepSelectable('share')
        }"
        :aria-current="store.step === 'share' ? 'step' : undefined"
        title="Step 4: Summary & Breakdown"
        @click="navigateToStep('share')"
      >4</div>
    </div>
  </header>

  <!-- Application Content Section -->
  <main class="app-content">
    
    <!-- OCR Loading scanning Screen -->
    <div v-if="store.isParsing" class="parsing-overlay">
      <div class="ocr-scanner"></div>
      <h3>Parsing Receipt Image...</h3>
      <p class="text-secondary text-sm">Please ensure the photo is clear and well-lit.</p>
      <p class="text-secondary/80 text-xs mt-1">Scanning is limited to 30 seconds.</p>
    </div>

    <!-- Step 1: Image Capture -->
    <div v-else-if="store.step === 'capture'" class="step-view">
      <div class="text-center py-4">
        <h2 class="text-2xl font-extrabold mb-1">Split Bills Instantly</h2>
      </div>

      <!-- OCR Error Notice -->
      <div v-if="store.ocrError" class="error-banner mb-3">
        <div class="flex justify-between items-start">
          <div class="flex gap-2 items-start text-left">
            <i class="pi pi-exclamation-triangle text-rose-500 mt-0.5" style="font-size: 1.1rem;"></i>
            <div>
              <h5 class="font-extrabold text-sm text-slate-900 dark:text-slate-100">OCR Parsing Failed</h5>
              <p class="text-xs text-secondary mt-0.5">{{ store.ocrError }}</p>
            </div>
          </div>
          <Button 
            icon="pi pi-times" 
            class="p-button-text p-button-danger p-button-sm" 
            :style="{ height: 'auto', minWidth: 'auto', padding: '0 !important' }"
            @click="store.ocrError = null" 
          />
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <!-- Option 1: Live Camera -->
        <div 
          class="capture-option-card" 
          :class="{ 'locked-option': isScanLimitReached || !isOnline }"
          @click="triggerCamera"
        >
          <i :class="!isOnline ? 'pi pi-wifi text-amber-500/80 capture-icon-sm' : (isScanLimitReached ? 'pi pi-lock text-rose-500/80 capture-icon-sm' : 'pi pi-camera capture-icon-sm')" style="font-size: 48px !important;"></i>
          <div>
            <h4 class="font-bold text-lg flex items-center gap-1.5 justify-center xs:justify-start">
              Scan Receipt with Camera
              <span v-if="!isOnline" class="text-xs text-amber-500 font-black uppercase tracking-wider">(Offline)</span>
              <span v-else-if="isScanLimitReached" class="text-xs text-rose-500/90 font-black uppercase tracking-wider">(Locked)</span>
            </h4>
            <p class="text-secondary text-sm">
              {{ !isOnline ? 'Network Connection Required to Scan. Tap "Manual" instead.' : (isScanLimitReached ? 'Upgrade to scan physical receipts' : 'Snap a photo of your receipt') }}
            </p>
          </div>
          <input 
            type="file" 
            ref="cameraInput" 
            accept="image/*" 
            capture="environment" 
            class="hidden" 
            @change="onFileCaptured" 
          />
        </div>

        <!-- Option 2: Upload Receipt Image from Gallery -->
        <div 
          class="capture-option-card" 
          :class="{ 'locked-option': isScanLimitReached || !isOnline }"
          @click="triggerGallery"
        >
          <i :class="!isOnline ? 'pi pi-wifi text-amber-500/80 capture-icon-sm' : (isScanLimitReached ? 'pi pi-lock text-rose-500/80 capture-icon-sm' : 'pi pi-images capture-icon-sm')" style="font-size: 48px !important;"></i>
          <div>
            <h4 class="font-bold text-lg flex items-center gap-1.5 justify-center xs:justify-start">
              Upload Receipt Image from Gallery
              <span v-if="!isOnline" class="text-xs text-amber-500 font-black uppercase tracking-wider">(Offline)</span>
              <span v-else-if="isScanLimitReached" class="text-xs text-rose-500/90 font-black uppercase tracking-wider">(Locked)</span>
            </h4>
            <p class="text-secondary text-sm">
              {{ !isOnline ? 'Network Connection Required to Scan. Tap "Manual" instead.' : (isScanLimitReached ? 'Upgrade to upload images' : 'Upload an existing photo or screenshot') }}
            </p>
          </div>
          <input 
            type="file" 
            ref="galleryInput" 
            accept="image/*" 
            class="hidden" 
            @change="onFileCaptured" 
          />
        </div>
      </div>



      <div class="text-center mt-4">
        <p class="text-secondary text-xs mb-2 font-semibold uppercase tracking-wider">Or start splitting manually</p>
        <div class="flex gap-2 justify-center flex-wrap">
          <Button 
            v-if="store.usageInfo && store.usageInfo.passType === 'dev_unlimited'"
            label="🥞 Brunch" 
            class="p-button-outlined p-button-sm" 
            @click="loadDemoReceipt(0)" 
          />
          <Button 
            v-if="store.usageInfo && store.usageInfo.passType === 'dev_unlimited'"
            label="🍷 Dinner" 
            class="p-button-outlined p-button-sm" 
            @click="loadDemoReceipt(1)" 
          />
          <Button 
            label="✍ Enter Receipt Items Manually" 
            class="p-button-outlined p-button-sm" 
            @click="startManualEntry" 
          />
        </div>
      </div>

      <!-- Usage Limit / Plan Info Indicator -->
      <div v-if="store.usageInfo" class="text-center mt-5 p-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/20">
        <p v-if="store.usageInfo.passType === 'trip'" class="text-xs text-primary font-extrabold flex justify-center items-center gap-1.5">
          <i class="pi pi-bolt"></i> 14-Day Pass Active <span v-if="store.usageInfo.expirationDate">(Until {{ formatPassDate(store.usageInfo.expirationDate) }})</span><span v-else>(Unlimited Scans)</span>
        </p>
        <p v-else-if="store.usageInfo.passType === 'yearly'" class="text-xs text-emerald-400 font-extrabold flex justify-center items-center gap-1.5">
          <i class="pi pi-star-fill"></i> Yearly Pro Active (100 scans/mo)
        </p>
        <p v-else-if="store.usageInfo.passType === 'dev_unlimited'" class="text-xs text-secondary font-bold italic">
          🛠️ Dev Mode (Bypassed / Unlimited)
        </p>
        <div v-else class="flex flex-col items-center gap-1">
          <p class="text-xs text-secondary font-semibold">
            Free scans left this month: 
            <span class="text-primary font-black">{{ store.usageInfo.freeScansRemaining }} / {{ store.usageInfo.freeScansLimit }}</span>
          </p>
          <div class="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              class="bg-primary h-full transition-all duration-300"
              :style="{ width: `${(store.usageInfo.freeScansRemaining / store.usageInfo.freeScansLimit) * 100}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Saved Splits History Section -->
      <Transition name="fade" appear>
        <div v-if="savedSplits.length > 0" class="mt-6 flex flex-col gap-2">
          <div class="flex justify-between items-center px-1">
            <label class="text-xs font-semibold text-secondary uppercase tracking-wider">Saved Splits / History</label>
            <Button 
              icon="pi pi-trash" 
              label="Clear" 
              class="p-button-text p-button-sm text-[10px] text-rose-500" 
              :style="{ height: 'auto', padding: '0 !important' }"
              @click="clearHistory"
            />
          </div>
          
          <TransitionGroup 
            name="list" 
            tag="div" 
            class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1"
          >
            <div 
              v-for="split in visibleSplits" 
              :key="split.splitId" 
              class="history-card flex items-center"
              @click="loadSavedSplit(split)"
            >
              <div class="shrink-0 mr-3 flex items-center justify-center text-slate-500 dark:text-slate-400" style="width: 32px; height: 32px; font-size: 16px;">
                <i :class="getCategoryIcon(split.category || 'food_drink')"></i>
              </div>
              <div class="flex-1 min-w-0 pr-2">
                <h5 class="font-bold text-sm text-slate-800 dark:text-slate-100 truncate text-left m-0">{{ split.billName || 'Untitled Bill' }}</h5>
                <!-- Participant list -->
                <p class="text-[10px] text-slate-400 dark:text-slate-400 truncate text-left mt-0.5 m-0 font-medium">
                  {{ split.participants ? split.participants.map((p: any) => p.name).join(', ') : `${split.participantsCount} people` }}
                </p>
                <div class="flex items-center gap-1.5 text-[9px] text-slate-500 mt-1 font-semibold">
                  <span>{{ formatDate(split.timestamp) }}</span>
                </div>
              </div>
              
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="font-bold text-primary text-sm font-black">{{ split.currencySymbol || '$' }}{{ split.totalBill.toFixed(2) }}</span>
                <i class="pi pi-chevron-right text-xs text-slate-500"></i>
              </div>
            </div>
          </TransitionGroup>

          <!-- Show More / Less button -->
          <Button 
            v-if="savedSplits.length > 3"
            :label="showAllHistory ? 'Show Less' : `Show More (${savedSplits.length - 3} more)`" 
            :icon="showAllHistory ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            class="p-button-text p-button-sm w-full mt-1 text-slate-400 hover:text-slate-200 text-xs font-bold" 
            @click="showAllHistory = !showAllHistory"
          />
        </div>
      </Transition>

      <!-- Version Footer -->
      <div class="app-version" @click="handleVersionTap">
        VERSION: v{{ appVersion }}
      </div>
    </div>

    <!-- Step 2: Edit Items -->
    <div v-else-if="store.step === 'edit'" class="step-view">
      <!-- Bill Title Editor -->
      <div class="flex flex-col gap-1.5 px-1 mb-3">
        <label class="text-xs font-semibold text-secondary uppercase tracking-wider">Bill / Event Title</label>
        <input 
          v-model="store.billName" 
          type="text"
          placeholder="e.g. 2026-06-27 - Pizza Express" 
          class="p-2 border-3 border-black rounded-lg font-bold bg-white text-black shadow-[3px_3px_0px_rgba(0,0,0,1)] text-sm focus:outline-none focus:border-primary" 
          @change="store.saveToLocalStorage()"
          @focus="selectAllText"
        />
      </div>

      <!-- Bill Settings Grid -->
      <div class="grid grid-cols-2 gap-3 px-1 mb-4">
        <!-- Category Selector -->
        <div class="flex flex-col gap-1 text-left">
          <label class="text-[10px] font-extrabold text-secondary uppercase tracking-wider">Category</label>
          <div 
            @click="openCategorySelector"
            class="custom-select-trigger text-xs"
          >
            <span>{{ getCategoryLabel(store.category) }}</span>
            <i class="pi pi-chevron-down text-[10px] text-slate-400"></i>
          </div>
        </div>

        <!-- Currency Selector -->
        <div class="flex flex-col gap-1 text-left">
          <label class="text-[10px] font-extrabold text-secondary uppercase tracking-wider">Currency</label>
          <div 
            @click="openCurrencySelector"
            class="custom-select-trigger text-xs"
          >
            <span>{{ getCurrencyLabel(store.currencySymbol) }}</span>
            <i class="pi pi-chevron-down text-[10px] text-slate-400"></i>
          </div>
        </div>
      </div>

      <div class="bill-card">
        <div class="flex justify-between items-center mb-2">
          <h3 class="font-bold">Review Items</h3>
          <Button 
            icon="pi pi-plus" 
            label="Add Row" 
            class="p-button-text p-button-sm" 
            @click="store.addItem()" 
          />
        </div>

        <!-- Editable Item Rows -->
        <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          <div 
            v-for="item in store.items" 
            :key="item.id" 
            class="item-row flex gap-2 items-center"
          >
            <InputText 
              v-model="item.name" 
              placeholder="Item name" 
              class="item-name-input p-inputtext-sm" 
              @focus="selectAllText"
            />
            <InputNumber 
              v-model="item.price" 
              mode="decimal" 
              :minFractionDigits="2" 
              :maxFractionDigits="2" 
              placeholder="0.00" 
              class="item-price-input" 
              @focus="selectAllText"
            />
            <Button 
              icon="pi pi-cog" 
              class="p-button-text p-button-secondary p-button-sm shrink-0" 
              :style="{ width: '32px', minWidth: '32px', height: '32px', padding: '0' }"
              @click="openEditItemModal(item.id)" 
            />
            <Button 
              icon="pi pi-trash" 
              class="item-delete-btn" 
              @click="store.removeItem(item.id)" 
            />
          </div>
        </div>

        <hr class="border-t border-slate-200 dark:border-slate-700 my-2" />

        <!-- Tip Input panel (Full Width) -->
        <div class="flex flex-col gap-1 mt-1">
          <div class="flex justify-between items-center">
            <label class="text-xs font-semibold text-secondary">Add Tip?</label>
            <!-- Switch flat vs percentage -->
            <span 
              class="text-[10px] cursor-pointer font-bold" 
              :class="store.tipType === 'percentage' ? 'text-primary' : 'text-secondary'"
              @click="store.tipType = store.tipType === 'percentage' ? 'flat' : 'percentage'"
            >
              {{ store.tipType === 'percentage' ? '%' : 'Cash' }}
            </span>
          </div>
          <InputNumber 
            v-model="store.tipInput" 
            mode="decimal" 
            :minFractionDigits="store.tipType === 'flat' ? 2 : 0" 
            :maxFractionDigits="store.tipType === 'flat' ? 2 : 0" 
            class="p-inputtext-sm w-full" 
            :inputStyle="{ width: '100%' }"
            @focus="selectAllText"
          />
        </div>

        <!-- Quick Tip Suggester -->
        <div class="flex gap-1 justify-end items-center mt-1">
          <span class="text-[10px] font-bold text-secondary uppercase mr-1">Quick Tip:</span>
          <Button 
            v-for="pct in [15, 18, 20]" 
            :key="pct"
            :label="`${pct}%`" 
            class="p-button-outlined tip-tag-btn" 
            :class="{ 'p-button-primary': store.tipType === 'percentage' && store.tipInput === pct }"
            @click="store.tipType = 'percentage'; store.tipInput = pct" 
          />
          <Button 
            label="0%" 
            class="p-button-outlined tip-tag-btn" 
            :class="{ 'p-button-primary': store.tipInput === 0 }"
            @click="store.tipInput = 0" 
          />
        </div>

        <!-- Fees & Taxes Subtotal Adjustments List -->
        <div class="flex flex-col gap-1.5 mt-3">
          <div class="flex justify-between items-center px-1">
            <label class="text-xs font-semibold text-secondary uppercase tracking-wider">Fees & Taxes</label>
            <Button 
              icon="pi pi-plus" 
              label="Add Line" 
              class="p-button-text p-button-sm text-[10px]" 
              @click="store.addAdjustment('Service Charge', 0)"
            />
          </div>
          
          <div class="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
            <div 
              v-for="adj in store.adjustments" 
              :key="adj.id" 
              class="item-row"
            >
               <InputText 
                 v-model="adj.name" 
                 placeholder="Fee / Tax / Rounding" 
                 class="item-name-input p-inputtext-sm" 
                 @focus="selectAllText"
               />
               <InputNumber 
                 v-model="adj.value" 
                 mode="decimal" 
                 :minFractionDigits="2" 
                 :maxFractionDigits="2" 
                 placeholder="0.00" 
                 class="item-price-input" 
                 @focus="selectAllText"
               />
               <Button 
                 icon="pi pi-trash" 
                 class="item-delete-btn" 
                 @click="store.removeAdjustment(adj.id)" 
               />
            </div>
            
            <!-- Empty state if no adjustments are configured -->
            <div v-if="store.adjustments.length === 0" class="text-center py-2 border-2 border-dashed border-slate-700 rounded-lg">
              <span class="text-xs text-secondary italic">No fees or taxes. Click Add Line to add any.</span>
            </div>
          </div>
        </div>

        <!-- Totals Preview card (Receipt Sticker style) -->
        <div class="receipt-totals-sticker">
          <div class="flex justify-between">
            <span>SUBTOTAL:</span>
            <span class="font-bold">{{ store.currencySymbol }}{{ itemsSubtotal.toFixed(2) }}</span>
          </div>
          
          <!-- Dynamic Adjustments display list -->
          <div 
            v-for="adj in store.adjustments" 
            :key="adj.id" 
            class="flex justify-between text-xs text-secondary/90"
          >
            <span>{{ adj.name.toUpperCase() }}:</span>
            <span>{{ store.currencySymbol }}{{ adj.value.toFixed(2) }}</span>
          </div>
          
          <div class="flex justify-between">
            <span>TIP:</span>
            <span class="font-bold">{{ store.currencySymbol }}{{ tipAmount.toFixed(2) }}</span>
          </div>
          <div class="divider"></div>
          <div class="flex justify-between font-bold text-base mt-1">
            <span>TOTAL BILL:</span>
            <span class="text-primary-pink">{{ store.currencySymbol }}{{ totalBill.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Participants -->
    <div v-else-if="store.step === 'participants'" class="step-view">
      <div class="bill-card">
        <h3 class="font-bold mb-1">How many people are splitting?</h3>
        <p class="text-secondary text-[11px] mb-3 italic">Select participant count or add custom names below:</p>
        
        <!-- Quick Split buttons -->
        <div class="mb-2 py-2">
          <div class="flex gap-1 flex-wrap">
            <Button 
              v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]" 
              :key="n"
              :label="String(n)" 
              class="quick-add-btn"
              :class="store.participants.length === n ? 'p-button-primary' : 'p-button-outlined p-button-secondary'"
              @click="store.setParticipantCount(n)" 
            />
          </div>
        </div>

        <!-- Added Participants List -->
        <div class="flex flex-col gap-2 mt-2 max-h-[250px] overflow-y-auto">
          <div 
            v-for="p in store.participants" 
            :key="p.id" 
            class="participant-badge-row"
          >
            <div class="flex items-center gap-3 flex-1 mr-2">
              <div 
                class="avatar-badge cursor-pointer hover:scale-105 transition-transform" 
                title="Quick Pick Name"
                @click="openQuickPicker(p.id)"
              >
                {{ getInitials(p.name) }}
              </div>
              <input 
                v-model="p.name" 
                type="text" 
                class="participant-name-input"
                @change="onParticipantNameChanged(p.name)"
                @focus="selectAllText"
              />
            </div>
            <Button 
              icon="pi pi-times" 
              class="participant-delete-btn" 
              @click="store.removeParticipant(p.id)" 
            />
          </div>
          <p 
            v-if="store.participants.length === 0" 
            class="text-secondary text-sm text-center py-6"
          >
            Add at least one participant to proceed.
          </p>
        </div>

      </div>
    </div>

    <!-- Step 4: Cost Allocation -->
    <div v-else-if="store.step === 'allocate'" class="step-view">
      <!-- Validation warning banner -->
      <div v-if="hasAllocationErrors" class="bg-amber-500/10 border-2 border-amber-500 text-amber-500 p-2.5 rounded-lg text-xs font-bold flex items-center gap-2 mb-3">
        <i class="pi pi-exclamation-triangle"></i>
        <span>Some items are not fully allocated. Tap them to assign quantities.</span>
      </div>

      <div class="mb-2 flex justify-between items-center px-1">
        <div class="text-left">
          <h3 class="font-extrabold text-lg">Assign Items</h3>
          <p class="text-secondary text-xs">Tap an item to select who shares it.</p>
        </div>
      </div>

      <!-- Scrollable list of items for allocation -->
      <div class="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
        <div 
          v-for="item in store.items" 
          :key="item.id" 
          class="alloc-item-card" 
          :class="{ 'bulk-selected': bulkSelectedItems.includes(item.id), 'bulk-mode-item': isBulkMode }"
          @pointerdown="onItemPointerDown($event, item.id)"
          @pointerup="onItemPointerUp"
          @pointermove="onItemPointerMove($event)"
          @pointerleave="onItemPointerLeave"
          @click="onItemClick($event, item.id)"
        >
          <div class="flex items-center gap-3 w-full">
            <i 
              v-if="isBulkMode" 
              class="pi shrink-0 text-xl" 
              :class="bulkSelectedItems.includes(item.id) ? 'pi-check-circle text-primary' : 'pi-circle text-secondary'"
            ></i>
            <div class="flex-1 min-w-0">
              <div class="alloc-item-header">
                <span>{{ item.name }} <span v-if="item.quantity > 1" class="text-xs text-slate-400 font-normal">(x{{ item.quantity }}{{ item.isSplitEvenly ? ' - Shared' : '' }})</span></span>
                <span class="text-primary">{{ store.currencySymbol }}{{ item.price.toFixed(2) }}</span>
              </div>
              
              <div class="alloc-badges mt-1">
                <!-- Case 0: Multi-Quantity Item Allocation Displays -->
                <template v-if="item.quantity > 1 && !item.isSplitEvenly">
                  <div class="flex flex-wrap gap-1.5">
                    <span 
                      v-for="(count, pId) in item.assignedQuantities" 
                      :key="pId"
                      v-show="count > 0"
                      class="avatar-badge"
                      :class="{ 'full-name': showFullNames }"
                    >
                      {{ showFullNames ? (store.participants.find(p => p.id === pId)?.name || '??') : getInitials(store.participants.find(p => p.id === pId)?.name || '??') }} ({{ count }})
                    </span>
                  </div>
                </template>

                <template v-else>
                  <!-- Case 1: Everyone or empty (which defaults to everyone) -->
                  <span 
                    v-if="item.assignedTo.length === store.participants.length || item.assignedTo.length === 0" 
                    class="avatar-badge everyone"
                  >
                    Everyone
                  </span>
                  
                  <!-- Case 2: Everyone minus the excluded (only for 4+ participants and strict majority assigned) -->
                  <template v-else-if="store.participants.length >= 4 && item.assignedTo.length > store.participants.length / 2">
                    <span class="avatar-badge everyone">Everyone</span>
                    <span 
                      v-for="p in store.participants.filter(p => !item.assignedTo.includes(p.id))" 
                      :key="p.id" 
                      class="avatar-badge excluded"
                      :class="{ 'full-name': showFullNames }"
                      :title="`Excluded: ${p.name}`"
                    >
                      -{{ showFullNames ? p.name : getInitials(p.name) }}
                    </span>
                  </template>
                  
                  <!-- Case 3: Minority assigned (<50%) (List assigned participants in cyan) -->
                  <template v-else>
                    <!-- Included (Assigned) Participants -->
                    <span 
                      v-for="pId in item.assignedTo" 
                      :key="pId" 
                      class="avatar-badge"
                      :class="{ 'full-name': showFullNames }"
                      :title="store.participants.find(p => p.id === pId)?.name"
                    >
                      {{ showFullNames ? (store.participants.find(p => p.id === pId)?.name || '??') : getInitials(store.participants.find(p => p.id === pId)?.name || '??') }}
                    </span>
                  </template>
                </template>
              </div>

              <!-- Validation badge -->
              <div v-if="!isItemFullyAllocated(item)" class="text-amber-500 text-[10px] font-black uppercase flex items-center gap-1 mt-1">
                <i class="pi pi-exclamation-circle"></i>
                <span>
                  {{ item.quantity > 1 ? `${getRemainingQuantity(item)} unassigned` : 'unassigned' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick totals visual reference at bottom of allocation -->
      <div v-if="!isBulkMode" class="bill-card bg-slate-50 dark:bg-slate-800/40 mt-2">
        <h4 class="font-bold text-xs uppercase tracking-wider text-secondary">Split Preview</h4>
        <div class="flex flex-col gap-1 text-sm mt-1">
          <div 
            v-for="p in billBreakdown" 
            :key="p.id" 
            class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
          >
            <span class="font-medium">{{ p.name }}</span>
            <span class="font-bold text-indigo-500">{{ store.currencySymbol }}{{ p.total.toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <!-- Bulk Action Bar -->
      <div v-else class="bill-card border-2 border-primary mt-2 p-3 bg-pink-500/10">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-black uppercase text-pink-500">
            ⚡ {{ bulkSelectedItems.length }} selected
          </span>
          <div class="flex gap-2">
            <Button 
              label="Select All" 
              class="p-button-text p-button-sm text-[10px]" 
              @click="selectAllItems" 
            />
            <Button 
              label="Cancel" 
              class="p-button-text p-button-danger p-button-sm text-[10px]" 
              @click="exitBulkMode" 
            />
          </div>
        </div>
        
        <div class="flex gap-2">
          <Button 
            label="Assign Selected" 
            icon="pi pi-user-edit" 
            class="flex-1 p-button-sm" 
            @click="openBulkAssignDialog" 
          />
          <Button 
            label="Clear" 
            icon="pi pi-trash" 
            class="p-button-outlined p-button-danger p-button-sm" 
            @click="clearBulkAssignments" 
          />
        </div>
      </div>
    </div>

    <!-- Step 5: Final Breakdown and Share -->
    <div v-else-if="store.step === 'share'" class="step-view">
      <div class="text-center">
        <h2 class="text-2xl font-black text-indigo-500">All Splatted! 💸</h2>
        <p class="text-secondary text-sm">Tap a person to see their breakdown.</p>
      </div>

      <!-- Compact person cards -->
      <div class="bill-card">
        <h3 class="font-bold border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">Final Splits</h3>

        <div class="flex justify-between items-center mb-4 border-b border-dashed border-slate-200 dark:border-slate-700 pb-3 text-xs">
          <!-- Category Indicator -->
          <div class="flex items-center gap-1.5 font-bold">
            <div class="avatar-badge" style="width: 28px; height: 28px; font-size: 11px;">
              <i :class="getCategoryIcon(store.category)"></i>
            </div>
            <span class="capitalize text-slate-700 dark:text-slate-300">
              {{ store.category.replace('_', ' & ') }}
            </span>
          </div>
        </div>
        
        <div class="flex flex-col gap-5">
          <div 
            v-for="p in billBreakdown" 
            :key="p.id" 
            class="person-split-card"
            @click="openPersonDetail(p)"
          >
            <span class="flex items-center gap-2">
              <span class="avatar-badge">{{ getInitials(p.name) }}</span>
              <span class="font-semibold text-sm">{{ p.name }}</span>
            </span>
            <span class="flex items-center gap-2">
              <span class="text-lg font-bold text-primary">{{ store.currencySymbol }}{{ p.total.toFixed(2) }}</span>
              <i class="pi pi-chevron-right text-xs text-secondary"></i>
            </span>
          </div>
        </div>
      </div>

      <!-- View Original Bill Button -->
      <Button 
        v-if="store.receiptImage"
        label="View Original Bill" 
        icon="pi pi-image" 
        class="w-full p-button-outlined p-button-secondary mb-2"
        @click="showOriginalBill = true" 
      />

      <!-- Buttons -->
      <div class="flex gap-2">
        <Button 
          :label="copySuccess ? 'Copied! ✓' : 'Copy'" 
          :icon="copySuccess ? 'pi pi-check' : 'pi pi-copy'" 
          class="flex-1 p-button-lg"
          :class="copySuccess ? 'p-button-success' : 'p-button-outlined'"
          @click="copyToClipboard" 
        />
        <Button 
          label="Share" 
          icon="pi pi-share-alt" 
          class="flex-1 p-button-lg p-button-primary"
          @click="shareToNative" 
        />
      </div>
    </div>

    <!-- Original Bill View Dialog -->
    <Dialog 
      v-model:visible="showOriginalBill" 
      modal 
      header="Original Bill" 
      :style="{ width: '95%', maxWidth: '500px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div v-if="store.receiptImage" class="flex flex-col gap-4 items-center">
        <template v-if="store.receiptImage.startsWith('demo_image_uri_')">
          <div class="p-8 bg-slate-100 dark:bg-slate-800 rounded-lg text-center w-full border border-dashed border-slate-300">
            <i class="pi pi-info-circle text-4xl text-slate-400 mb-2"></i>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Demo Bill</p>
            <p class="text-xs text-slate-500 mt-1">No scanned image available for demo templates.</p>
          </div>
        </template>
        <template v-else>
          <div 
            class="bill-viewer-container"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <!-- Image Wrapper for Transforms -->
            <div 
              class="bill-viewer-img-wrapper"
              :style="{ 
                transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`
              }"
            >
              <img 
                :src="store.receiptImage" 
                alt="Original Scanned Bill" 
              />
            </div>

            <!-- Floating Zoom Controls at Bottom-Center -->
            <div class="bill-viewer-controls">
              <button 
                class="bill-zoom-btn"
                @click.stop="zoomOut" 
              >
                <i class="pi pi-minus"></i>
              </button>
              <span>{{ Math.round(zoomScale * 100) }}%</span>
              <button 
                class="bill-zoom-btn"
                @click.stop="zoomIn" 
              >
                <i class="pi pi-plus"></i>
              </button>
              <button 
                class="bill-zoom-btn"
                @click.stop="resetZoom" 
              >
                <i class="pi pi-refresh"></i>
              </button>
            </div>
          </div>
        </template>
        <Button 
          label="Close" 
          class="p-button-outlined p-button-secondary w-full" 
          @click="showOriginalBill = false" 
        />
      </div>
    </Dialog>


    <!-- Person detail popup -->
    <Dialog 
      v-model:visible="isPersonDetailOpen" 
      modal 
      :header="selectedBreakdownPerson ? `${selectedBreakdownPerson.name}'s Split` : 'Details'" 
      :style="{ width: '90%', maxWidth: '400px' }"
      :draggable="false"
    >
      <template v-if="selectedBreakdownPerson">
        <div class="flex flex-col gap-3">
          <!-- Total highlight -->
          <div class="text-center py-2">
            <span class="text-3xl font-black text-primary">{{ store.currencySymbol }}{{ selectedBreakdownPerson.total.toFixed(2) }}</span>
            <p class="text-xs text-secondary mt-1">Total owed</p>
          </div>

          <!-- Itemized breakdown -->
          <div class="flex flex-col gap-1 border-t border-slate-200 dark:border-slate-700 pt-3">
            <div v-for="item in selectedBreakdownPerson.items" :key="item.name" class="flex justify-between text-sm py-0.5">
              <span>{{ item.name }}</span>
              <span class="font-semibold">{{ store.currencySymbol }}{{ item.sharePrice.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between text-sm text-secondary border-t border-slate-100 dark:border-slate-800 pt-1 mt-1">
              <span>Subtotal</span>
              <span>{{ store.currencySymbol }}{{ selectedBreakdownPerson.subtotal.toFixed(2) }}</span>
            </div>
            <div v-if="selectedBreakdownPerson.tax !== 0" class="flex justify-between text-sm text-secondary">
              <span>Adjustments / Fees</span>
              <span>{{ store.currencySymbol }}{{ selectedBreakdownPerson.tax.toFixed(2) }}</span>
            </div>
            <div v-if="selectedBreakdownPerson.tip > 0" class="flex justify-between text-sm text-secondary">
              <span>Tip</span>
              <span>{{ store.currencySymbol }}{{ selectedBreakdownPerson.tip.toFixed(2) }}</span>
            </div>
          </div>

          <!-- Popup buttons -->
          <div class="flex gap-2 pt-2">
            <Button 
              :label="copySuccess ? 'Copied! ✓' : 'Copy'" 
              :icon="copySuccess ? 'pi pi-check' : 'pi pi-copy'" 
              class="flex-1"
              :class="copySuccess ? 'p-button-success' : 'p-button-outlined'"
              @click="copyPersonToClipboard" 
            />
            <Button 
              label="Share" 
              icon="pi pi-share-alt" 
              class="flex-1 p-button-primary"
              @click="sharePersonToNative" 
            />
          </div>
        </div>
      </template>
    </Dialog>



    <!-- Modal dialogue for assignment selection -->
    <Dialog 
      v-model:visible="isAllocationOpen" 
      modal 
      :header="selectedItem ? `Split: ${selectedItem.name}` : 'Assign Item'" 
      :style="{ width: '90%', maxWidth: '400px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div v-if="selectedItem" class="flex flex-col gap-4">
        <!-- Case 1: Multi-Quantity Item -->
        <template v-if="selectedItem.quantity > 1">
          <!-- Split mode switcher -->
          <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Split Evenly</span>
            <Button 
              :icon="selectedItem.isSplitEvenly ? 'pi pi-check-circle' : 'pi pi-circle'" 
              :label="selectedItem.isSplitEvenly ? 'Enabled' : 'Disabled'"
              class="p-button-sm py-1 px-2 text-xs shrink-0"
              :class="selectedItem.isSplitEvenly ? 'p-button-success' : 'p-button-outlined p-button-secondary'"
              @click="toggleSplitEvenly(selectedItem)"
            />
          </div>

          <!-- Split Evenly Mode ON (Checkboxes) -->
          <div v-if="selectedItem.isSplitEvenly" class="flex flex-col gap-3">
            <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
              <span class="text-sm font-semibold">Price per share:</span>
              <span class="text-lg font-black text-indigo-500">
                {{ store.currencySymbol }}{{ 
                  (selectedItem.price / (selectedItem.assignedTo.length || store.participants.length)).toFixed(2) 
                }}
              </span>
            </div>

            <p class="text-xs text-secondary">Toggle participants assigned to this item:</p>
            
            <!-- Toggle List -->
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="p in store.participants" 
                :key="p.id" 
                class="selection-row"
                :class="{ 'selected': selectedItem.assignedTo.includes(p.id) }"
                @click="store.toggleItemAssignment(selectedItem.id, p.id)"
              >
                <div class="flex items-center gap-3">
                  <div class="avatar-badge">{{ getInitials(p.name) }}</div>
                  <span class="text-sm font-bold">{{ p.name }}</span>
                </div>
                <div class="custom-checkbox" :class="{ 'checked': selectedItem.assignedTo.includes(p.id) }">
                  <i class="pi pi-check" v-if="selectedItem.assignedTo.includes(p.id)"></i>
                </div>
              </div>
            </div>

            <div class="flex gap-2 mt-2">
              <Button 
                label="Select Everyone" 
                class="p-button-outlined p-button-sm flex-1" 
                @click="store.assignAllToItem(selectedItem.id)" 
              />
              <Button 
                label="Clear All" 
                class="p-button-outlined p-button-danger p-button-sm flex-1" 
                @click="store.clearAllFromItem(selectedItem.id)" 
              />
            </div>
          </div>

          <!-- Split Evenly Mode OFF (Counters) -->
          <div v-else class="flex flex-col gap-3">
            <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
              <div class="flex flex-col text-left">
                <span class="text-[10px] font-semibold text-secondary uppercase">Unit Price</span>
                <span class="text-sm font-bold">{{ store.currencySymbol }}{{ (selectedItem.price / selectedItem.quantity).toFixed(2) }} each</span>
              </div>
              <div class="flex flex-col text-right">
                <span class="text-[10px] font-semibold text-secondary uppercase">Unassigned</span>
                <span class="text-sm font-bold" :class="getRemainingQuantity(selectedItem) > 0 ? 'text-amber-500' : 'text-emerald-500'">
                  {{ getRemainingQuantity(selectedItem) }} / {{ selectedItem.quantity }} left
                </span>
              </div>
            </div>

            <p class="text-xs text-secondary">Allocate item quantities to participants:</p>

            <!-- Counters List -->
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="p in store.participants" 
                :key="p.id" 
                class="flex justify-between items-center p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div class="flex items-center gap-3">
                  <div class="avatar-badge">{{ getInitials(p.name) }}</div>
                  <span class="text-sm font-bold">{{ p.name }}</span>
                </div>
                
                <div class="flex items-center gap-2">
                  <Button 
                    icon="pi pi-minus" 
                    class="p-button-rounded p-button-text p-button-sm" 
                    :disabled="!(selectedItem.assignedQuantities && selectedItem.assignedQuantities[p.id] > 0)"
                    @click="decrementAssignment(selectedItem.id, p.id)" 
                  />
                  <input 
                    type="number" 
                    step="any"
                    min="0"
                    :value="(selectedItem.assignedQuantities && selectedItem.assignedQuantities[p.id]) || 0"
                    @input="onAllocationValueInput(selectedItem.id, p.id, $event)"
                    class="w-12 text-center font-bold border-2 border-black rounded bg-white text-black p-0.5 text-xs focus:outline-none focus:border-primary"
                  />
                  <Button 
                    icon="pi pi-plus" 
                    class="p-button-rounded p-button-text p-button-sm" 
                    :disabled="getRemainingQuantity(selectedItem) <= 0"
                    @click="incrementAssignment(selectedItem.id, p.id)" 
                  />
                </div>
              </div>
            </div>

            <div class="flex gap-2 mt-2">
              <Button 
                label="Clear All" 
                class="p-button-outlined p-button-danger p-button-sm w-full" 
                @click="store.clearAllFromItem(selectedItem.id)" 
              />
            </div>
          </div>
        </template>

        <!-- Case 2: Single-Quantity Item (Existing flow) -->
        <template v-else>
          <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
            <span class="text-sm font-semibold">Price per share:</span>
            <span class="text-lg font-black text-indigo-500">
              {{ store.currencySymbol }}{{ 
                (selectedItem.price / (selectedItem.assignedTo.length || store.participants.length)).toFixed(2) 
              }}
            </span>
          </div>

          <p class="text-xs text-secondary">Toggle participants assigned to this item:</p>
          
          <!-- Toggle List -->
          <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            <div 
              v-for="p in store.participants" 
              :key="p.id" 
              class="selection-row"
              :class="{ 'selected': selectedItem.assignedTo.includes(p.id) }"
              @click="store.toggleItemAssignment(selectedItem.id, p.id)"
            >
              <div class="flex items-center gap-3">
                <div class="avatar-badge">{{ getInitials(p.name) }}</div>
                <span class="text-sm font-bold">{{ p.name }}</span>
              </div>
              <div class="custom-checkbox" :class="{ 'checked': selectedItem.assignedTo.includes(p.id) }">
                <i class="pi pi-check" v-if="selectedItem.assignedTo.includes(p.id)"></i>
              </div>
            </div>
          </div>

          <div class="flex gap-2 mt-2">
            <Button 
              label="Select Everyone" 
              class="p-button-outlined p-button-sm flex-1" 
              @click="store.assignAllToItem(selectedItem.id)" 
            />
            <Button 
              label="Clear All" 
              class="p-button-outlined p-button-danger p-button-sm flex-1" 
              @click="store.clearAllFromItem(selectedItem.id)" 
            />
          </div>
        </template>

        <Button 
          label="Submit" 
          class="p-button-primary w-full mt-1" 
          @click="isAllocationOpen = false" 
        />
      </div>
    </Dialog>

    <!-- Edit Item Details Modal Dialog -->
    <Dialog 
      v-model:visible="isEditItemOpen" 
      modal 
      header="Edit Item Details" 
      :style="{ width: '90%', maxWidth: '350px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-secondary uppercase">Item Name</label>
          <InputText v-model="editingItemName" class="p-inputtext-sm w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-secondary uppercase">Total Price</label>
          <InputNumber 
            v-model="editingItemPrice" 
            mode="decimal" 
            :minFractionDigits="2" 
            :maxFractionDigits="2" 
            class="w-full p-inputtext-sm" 
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-secondary uppercase">Quantity</label>
          <div class="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <Button 
              icon="pi pi-minus" 
              class="p-button-rounded p-button-text p-button-sm" 
              :disabled="editingItemQuantity <= 1"
              @click="editingItemQuantity = Math.max(1, editingItemQuantity - 1)" 
            />
            <span class="text-lg font-black w-12 text-center text-slate-800 dark:text-slate-200">
              {{ editingItemQuantity }}
            </span>
            <Button 
              icon="pi pi-plus" 
              class="p-button-rounded p-button-text p-button-sm" 
              @click="editingItemQuantity = editingItemQuantity + 1" 
            />
          </div>
        </div>
        <div class="flex gap-2 mt-2">
          <Button 
            label="Cancel" 
            class="p-button-outlined p-button-secondary flex-1" 
            @click="isEditItemOpen = false" 
          />
          <Button 
            label="Save" 
            class="p-button-primary flex-1" 
            @click="saveEditItem" 
          />
        </div>
      </div>
    </Dialog>

    <!-- Bulk Assignment Modal Dialog -->
    <Dialog 
      v-model:visible="isBulkAssignOpen" 
      modal 
      header="Bulk Assign Items" 
      :style="{ width: '90%', maxWidth: '400px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div class="flex flex-col gap-4">
        <p class="text-xs text-secondary">
          Select participants to assign to the {{ bulkSelectedItems.length }} selected items:
        </p>

        <!-- Toggle List of Participants -->
        <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          <div 
            v-for="p in store.participants" 
            :key="p.id" 
            class="selection-row"
            :class="{ 'selected': bulkSelectedParticipants.includes(p.id) }"
            @click="toggleBulkParticipant(p.id)"
          >
            <div class="flex items-center gap-3">
              <div class="avatar-badge">{{ getInitials(p.name) }}</div>
              <span class="text-sm font-bold">{{ p.name }}</span>
            </div>
            <div class="custom-checkbox" :class="{ 'checked': bulkSelectedParticipants.includes(p.id) }">
              <i class="pi pi-check" v-if="bulkSelectedParticipants.includes(p.id)"></i>
            </div>
          </div>
        </div>

        <div class="flex gap-2 mt-2">
          <Button 
            label="Select Everyone" 
            class="p-button-outlined p-button-sm flex-1" 
            @click="bulkSelectEveryone" 
          />
          <Button 
            label="Clear All" 
            class="p-button-outlined p-button-danger p-button-sm flex-1" 
            @click="bulkClearEveryone" 
          />
        </div>

        <!-- Bulk Action Buttons -->
        <div class="flex flex-col gap-2 mt-1">
          <Button 
            label="Set Assignees" 
            class="p-button-primary w-full" 
            :disabled="bulkSelectedParticipants.length === 0"
            @click="applyBulkAssignment" 
          />
        </div>
      </div>
    </Dialog>

    <!-- Quick Select Participant Name Picker Dialogue -->
    <Dialog 
      v-model:visible="isQuickPickerOpen" 
      modal 
      header="Quick Select Name" 
      :style="{ width: '90%', maxWidth: '340px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div class="flex flex-col gap-3">
        <p class="text-xs text-secondary mb-1">Select from your saved custom names:</p>
        <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          <div 
            v-for="name in savedCustomNames" 
            :key="name"
            class="quick-name-row"
            @click="applyQuickName(name)"
          >
            <span class="font-bold text-sm text-slate-800 dark:text-slate-100">{{ name }}</span>
            <i class="pi pi-plus text-xs text-primary"></i>
          </div>
          <div v-if="savedCustomNames.length === 0" class="text-center py-6 text-xs text-secondary italic border-2 border-dashed border-slate-700 rounded-lg">
            No saved names yet. Type a name to save it automatically!
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Paywall / Premium Upgrade Dialogue -->
    <Dialog 
      v-model:visible="store.showPaywall" 
      modal 
      header="Unlock Pro Features ⚡" 
      :style="{ width: '90%', maxWidth: '400px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div class="flex flex-col gap-4">
        <p class="text-xs text-secondary text-center leading-relaxed">
          You've reached your free scan limit. Upgrade to continue splitting bills instantly with advanced AI!
        </p>

        <!-- Pricing Cards -->
        <div class="flex flex-col gap-3">
          <!-- Option 1: Yearly subscription -->
          <div 
            class="relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200"
            :class="selectedPaywallOption === 'yearly' ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'"
            @click="selectedPaywallOption = 'yearly'"
          >
            <div class="absolute -top-2.5 right-4 bg-emerald-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
              BEST VALUE
            </div>
            <div class="flex justify-between items-center mb-1">
              <div class="flex items-center gap-2">
                <i class="pi pi-star-fill text-amber-400 text-sm"></i>
                <span class="font-bold text-sm text-slate-100">Yearly Pro Plan</span>
              </div>
              <div class="flex flex-col items-end">
                <span class="font-black text-primary text-base">$9.99<span class="text-xs font-semibold text-secondary">/yr</span></span>
              </div>
            </div>
            <p class="text-[11px] text-secondary">
              100 scans per month (~$0.83/mo). Auto-renews annually. Cancel anytime.
            </p>
          </div>

          <!-- Option 2: 14-Day Pass -->
          <div 
            class="relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200"
            :class="selectedPaywallOption === 'trip' ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'"
            @click="selectedPaywallOption = 'trip'"
          >
            <div class="flex justify-between items-center mb-1">
              <div class="flex items-center gap-2">
                <i class="pi pi-bolt text-primary text-sm"></i>
                <span class="font-bold text-sm text-slate-100">14-Day Trip Pass</span>
              </div>
              <span class="font-black text-primary text-base">$1.99</span>
            </div>
            <p class="text-[11px] text-secondary">
              Unlimited scans for 14 days. One-time payment, no subscription. Perfect for holidays!
            </p>
          </div>
        </div>

        <!-- Call to Action button -->
        <Button 
          :label="isPurchasing ? 'Processing...' : (selectedPaywallOption === 'yearly' ? 'Subscribe Yearly Pro — $9.99' : 'Buy 14-Day Pass — $1.99')" 
          icon="pi pi-bolt" 
          class="w-full p-button-lg mt-2 font-bold" 
          :loading="isPurchasing"
          @click="handlePaywallPurchase" 
        />

        <!-- Restore Purchases button for App Store compliance -->
        <Button 
          v-if="Capacitor.isNativePlatform()"
          label="Restore Purchases" 
          icon="pi pi-refresh" 
          class="w-full p-button-outlined p-button-secondary p-button-sm mt-1" 
          :loading="isPurchasing"
          @click="handleRestorePurchases" 
        />

        <p class="text-[10px] text-slate-500 text-center leading-normal">
          By upgrading, you agree to our Terms and Privacy Policy. Secure processing powered by App Store / Google Play.
        </p>
      </div>
    </Dialog>

    <!-- Developer Menu Dialog -->
    <Dialog 
      v-model:visible="isDevMenuOpen" 
      modal 
      header="🛠️ Developer Options" 
      :style="{ width: '90%', maxWidth: '360px' }"
      :draggable="false"
      class="dark:bg-slate-900"
    >
      <div class="flex flex-col gap-4">
        <div>
          <label class="text-[10px] font-semibold text-secondary uppercase tracking-wider">Device ID</label>
          <div class="bg-slate-950 p-2 rounded-lg text-slate-300 font-mono text-[9px] break-all select-all border border-slate-800">
            {{ localDeviceId }}
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <!-- Force Show UI option -->
          <Button 
            label="Force Show Paywall" 
            icon="pi pi-exclamation-circle" 
            class="p-button-outlined p-button-sm w-full" 
            @click="store.showPaywall = true; isDevMenuOpen = false" 
          />

          <!-- Client-Side Simulation Mode -->
          <div class="flex flex-col gap-1.5 border-t border-slate-800 pt-3">
            <label class="text-[10px] font-semibold text-secondary uppercase tracking-wider">Simulate Scan Limits</label>
            <div class="grid grid-cols-3 gap-1.5">
              <Button 
                label="5 Left" 
                class="p-button-outlined p-button-sm text-xs py-1 px-0" 
                :class="{ 'p-button-primary': store.simulatedUsage && store.simulatedUsage.freeScansRemaining === 5 && !store.simulatedUsage.passType }"
                @click="store.setSimulatedUsage(null, 0); isDevMenuOpen = false" 
              />
              <Button 
                label="1 Left" 
                class="p-button-outlined p-button-sm text-xs py-1 px-0" 
                :class="{ 'p-button-primary': store.simulatedUsage && store.simulatedUsage.freeScansRemaining === 1 && !store.simulatedUsage.passType }"
                @click="store.setSimulatedUsage(null, 4); isDevMenuOpen = false" 
              />
              <Button 
                label="0 Left" 
                class="p-button-outlined p-button-sm text-xs py-1 px-0" 
                :class="{ 'p-button-primary': store.simulatedUsage && store.simulatedUsage.freeScansRemaining === 0 && !store.simulatedUsage.passType }"
                @click="store.setSimulatedUsage(null, 5); isDevMenuOpen = false" 
              />
            </div>
          </div>

          <!-- Purchase Pass Simulation -->
          <div class="flex flex-col gap-2 border-t border-slate-800 pt-3">
            <label class="text-[10px] font-semibold text-secondary uppercase tracking-wider">Simulate Purchases</label>
            <Button 
              label="Simulate 14-Day Pass" 
              icon="pi pi-bolt" 
              class="p-button-outlined p-button-success p-button-sm w-full" 
              :class="{ 'p-button-primary': store.simulatedUsage && store.simulatedUsage.passType === 'trip' }"
              :loading="isPerformingDevAction"
              @click="handleDevAction('trip')" 
            />
            <Button 
              label="Simulate Yearly Subscription" 
              icon="pi pi-star" 
              class="p-button-outlined p-button-success p-button-sm w-full" 
              :class="{ 'p-button-primary': store.simulatedUsage && store.simulatedUsage.passType === 'yearly' }"
              :loading="isPerformingDevAction"
              @click="handleDevAction('yearly')" 
            />
          </div>

          <!-- Reset / Remove Mode -->
          <div class="flex flex-col gap-2 border-t border-slate-800 pt-3">
            <Button 
              label="Reset Usage & Remove Passes" 
              icon="pi pi-trash" 
              class="p-button-outlined p-button-danger p-button-sm w-full" 
              :loading="isPerformingDevAction"
              @click="handleDevAction('reset')" 
            />
            <Button 
              v-if="store.simulatedUsage"
              label="Exit Simulation (Dev Mode)" 
              icon="pi pi-refresh" 
              class="p-button-text p-button-sm w-full text-slate-400 hover:text-slate-100" 
              @click="store.clearSimulatedUsage(); isDevMenuOpen = false" 
            />
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Saved Split History Detail Dialog -->
    <Dialog 
      v-model:visible="isHistoryDetailOpen" 
      modal 
      :header="selectedHistorySplit?.billName || 'Saved Split Details'" 
      :style="{ width: '95%', maxWidth: '420px' }"
      :closable="true"
      class="neobrutalist-dialog"
    >
      <div v-if="selectedHistorySplit" class="flex flex-col gap-4 text-left">
        <!-- Overview -->
        <div class="border-b border-slate-800 pb-3 flex justify-between items-end">
          <div>
            <div class="text-[9px] text-secondary font-extrabold uppercase tracking-wider">Total Bill</div>
            <div class="text-xl font-black text-primary leading-tight mt-0.5">
              {{ selectedHistorySplit.currencySymbol || '$' }}{{ selectedHistorySplit.totalBill.toFixed(2) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-[9px] text-slate-500 font-semibold">
              📅 {{ formatDate(selectedHistorySplit.timestamp) }}
            </div>
          </div>
        </div>

        <!-- Items Breakdown -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold text-secondary uppercase tracking-wider">Receipt Items</label>
          <div class="max-h-[110px] overflow-y-auto pr-1 flex flex-col gap-1 border-2 border-slate-800 rounded-xl p-2 bg-slate-950/30">
            <div 
              v-for="item in selectedHistorySplit.items" 
              :key="item.id"
              class="flex justify-between items-center text-xs py-0.5"
            >
              <span class="text-slate-300 truncate max-w-[75%] font-medium">
                <span v-if="item.quantity > 1" class="font-black text-primary mr-1">{{ item.quantity }}x</span>
                {{ item.name }}
              </span>
              <span class="font-bold text-slate-200">
                {{ selectedHistorySplit.currencySymbol || '$' }}{{ item.price.toFixed(2) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Participant Totals -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold text-secondary uppercase tracking-wider">Participant Shares</label>
          <div class="max-h-[150px] overflow-y-auto pr-1 flex flex-col gap-2">
            <div 
              v-for="p in historyDetailBreakdown" 
              :key="p.id"
              class="flex flex-col gap-1 border-2 border-slate-800 rounded-xl p-2.5 bg-slate-900/30"
            >
              <div class="flex justify-between items-center text-xs font-bold">
                <span class="text-slate-100">{{ p.name }}</span>
                <span class="text-primary font-black">{{ selectedHistorySplit.currencySymbol || '$' }}{{ p.total.toFixed(2) }}</span>
              </div>
              <!-- Mini items list for each participant -->
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="itm in p.items" 
                  :key="itm.name"
                  class="text-[9px] text-slate-400 bg-slate-950/60 border border-slate-800 px-1.5 py-0.5 rounded-lg font-medium"
                >
                  {{ itm.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col gap-2 border-t border-slate-800 pt-3">
          <div class="flex gap-2">
            <Button 
              label="Edit Split" 
              icon="pi pi-pencil" 
              class="p-button-outlined p-button-secondary p-button-sm flex-1 font-bold" 
              @click="confirmRestoreSplit('edit')"
            />
            <Button 
              label="Share Summary" 
              icon="pi pi-share-alt" 
              class="p-button-primary p-button-sm flex-1 font-bold" 
              @click="confirmRestoreSplit('share')"
            />
          </div>
        </div>
      </div>
    </Dialog>

  </main>

  <!-- Stepper Navigation bar -->
  <nav class="app-nav" v-if="!store.isParsing && store.step !== 'capture'">
    <!-- Left: Back Button -->
    <Button 
      label="Back" 
      icon="pi pi-chevron-left" 
      class="p-button-text p-button-sm text-secondary min-w-[70px]" 
      @click="goBack" 
    />

    <!-- Center: Reset Button -->
    <Button 
      v-if="store.step !== 'share'" 
      label="Reset" 
      icon="pi pi-refresh" 
      class="p-button-text p-button-sm text-rose-500/80 hover:text-rose-500" 
      @click="handleReset" 
    />
    <div v-else></div> <!-- spacer -->

    <!-- Right: Next Button -->
    <Button 
      v-if="store.step !== 'share'" 
      :label="store.step === 'edit' ? 'Add Participants' : (store.step === 'participants' ? 'Assign Items' : 'Calculate Split')" 
      :icon="store.step === 'allocate' ? 'pi pi-check' : 'pi pi-chevron-right'" 
      iconPos="right" 
      class="p-button-sm min-w-[120px] font-bold" 
      :disabled="!canGoNext" 
      @click="goNext" 
    />
    <Button 
      v-else
      label="Start New Split" 
      icon="pi pi-refresh" 
      class="p-button-sm p-button-primary min-w-[140px]" 
      @click="store.reset()" 
    />
  </nav>

  <!-- Custom Touch Selector Sheet Dialog -->
  <Dialog 
    v-model:visible="isSelectorOpen" 
    modal 
    :header="selectorTitle" 
    :style="{ width: '90%', maxWidth: '380px' }"
    :closable="true"
    class="neobrutalist-dialog"
  >
    <div class="flex flex-col gap-2.5 py-1 max-h-[300px] overflow-y-auto pr-1">
      <div 
        v-for="opt in selectorOptions" 
        :key="String(opt.value)"
        @click="selectOption(opt.value)"
        class="selection-row w-full font-bold active:translate-x-[2px] active:translate-y-[2px]"
      >
        <div class="flex items-center gap-3">
          <span v-if="opt.icon" class="text-lg leading-none">{{ opt.icon }}</span>
          <span class="text-sm font-extrabold">{{ opt.label }}</span>
        </div>
      </div>
    </div>
  </Dialog>
</template>

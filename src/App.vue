<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Dialog from 'primevue/dialog'

// Import reactive store and computed properties
import { 
  store, 
  itemsSubtotal, 
  tipAmount, 
  totalBill, 
  billBreakdown, 
  shareTextSummary 
} from './store'

// Local UI states
const fileInput = ref<HTMLInputElement | null>(null)
const newParticipantName = ref('')
const participantInputRef = ref<HTMLInputElement | null>(null)
const copySuccess = ref(false)
const showFullNames = ref(false)

// Item allocation modal states
const isAllocationOpen = ref(false)
const selectedItemId = ref<string | null>(null)

const selectedItem = computed(() => {
  if (!selectedItemId.value) return null
  return store.items.find(item => item.id === selectedItemId.value) || null
})

// Lifecycle hook to restore session from localStorage on load
store.loadFromLocalStorage()

// Trigger native device camera
const triggerCamera = () => {
  if (fileInput.value) {
    fileInput.value.click()
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
  store.simulateOCR(`demo_image_uri_${index}`)
}

// Start splitting manually by skipping OCR and initializing a blank item
const startManualEntry = () => {
  store.reset()
  store.step = 'edit'
  store.addItem('New Item', 0)
}

// Add participant
const addParticipant = () => {
  const name = newParticipantName.value.trim()
  if (name) {
    store.addParticipant(name)
    newParticipantName.value = ''
    // Keep focus on input for rapid typing
    nextTick(() => {
      if (participantInputRef.value) {
        participantInputRef.value.focus()
      }
    })
  }
}

// Handle navigation validation
const canGoNext = computed(() => {
  if (store.step === 'edit') {
    return store.items.length > 0 && itemsSubtotal.value > 0
  }
  if (store.step === 'participants') {
    return store.participants.length > 0
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
    // Auto-focus participant input on step enter
    nextTick(() => {
      if (participantInputRef.value) {
        participantInputRef.value.focus()
      }
    })
  } else if (store.step === 'participants') {
    store.step = 'allocate'
    // Automatically assign everyone to all items if they haven't been customized yet
    store.items.forEach(item => {
      if (item.assignedTo.length === 0) {
        store.assignAllToItem(item.id)
      }
    })
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

// Open allocation dialog for an item
const openAllocation = (itemId: string) => {
  selectedItemId.value = itemId
  isAllocationOpen.value = true
}

// Format participant initials for circular badges
const getInitials = (name: string) => {
  return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

// Copy sharing plain text summary to clipboard
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(shareTextSummary.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to copy', e)
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
    <div class="stepper" v-else-if="!store.isParsing">
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'edit', 
          'completed': store.step !== 'edit' 
        }"
      >1</div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'participants', 
          'completed': store.step !== 'edit' && store.step !== 'participants' 
        }"
      >2</div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'allocate', 
          'completed': store.step === 'share' 
        }"
      >3</div>
      <div 
        class="step-node" 
        :class="{ 
          'active': store.step === 'share' 
        }"
      >4</div>
    </div>
  </header>

  <!-- Application Content Section -->
  <main class="app-content">
    
    <!-- OCR Loading scanning Screen -->
    <div v-if="store.isParsing" class="parsing-overlay">
      <div class="ocr-scanner"></div>
      <h3>Parsing Receipt Image...</h3>
      <p class="text-secondary text-sm">Our AI is extracting line items, prices, tax, and tip shares.</p>
    </div>

    <!-- Step 1: Image Capture -->
    <div v-else-if="store.step === 'capture'" class="step-view">
      <div class="text-center py-4">
        <h2 class="text-2xl font-extrabold mb-1">Split Bills Instantly</h2>
      </div>

      <!-- OCR Error Notice -->
      <div v-if="store.ocrError" class="error-banner mb-2">
        <div class="flex justify-between items-start">
          <div class="flex gap-2 items-start text-left">
            <i class="pi pi-exclamation-triangle text-rose-500 mt-1"></i>
            <div>
              <h5 class="font-bold text-sm text-rose-500">OCR Parsing Failed</h5>
              <p class="text-xs text-secondary">{{ store.ocrError }}</p>
            </div>
          </div>
          <Button 
            icon="pi pi-times" 
            class="p-button-text p-button-danger p-button-sm" 
            @click="store.ocrError = null" 
          />
        </div>
      </div>

      <div class="capture-container" @click="triggerCamera">
        <i class="pi pi-camera capture-icon"></i>
        <div>
          <h4 class="font-bold text-lg">Snap Receipt Photo</h4>
          <p class="text-secondary text-sm">Upload from camera roll or take live photo</p>
        </div>
        <input 
          type="file" 
          ref="fileInput" 
          accept="image/*" 
          capture="environment" 
          class="hidden" 
          @change="onFileCaptured" 
        />
      </div>

      <div class="text-center mt-4">
        <p class="text-secondary text-xs mb-2 font-semibold uppercase tracking-wider">Or start splitting manually</p>
        <div class="flex gap-2 justify-center flex-wrap">
          <Button 
            label="🥞 Brunch" 
            class="p-button-outlined p-button-sm" 
            @click="loadDemoReceipt(0)" 
          />
          <Button 
            label="🍷 Dinner" 
            class="p-button-outlined p-button-sm" 
            @click="loadDemoReceipt(1)" 
          />
          <Button 
            label="✍ Manual" 
            class="p-button-outlined p-button-sm" 
            @click="startManualEntry" 
          />
        </div>
      </div>

    </div>

    <!-- Step 2: Edit Items -->
    <div v-else-if="store.step === 'edit'" class="step-view">
      <div class="bill-card">
        <div class="flex justify-between items-center mb-2">
          <h3 class="font-bold">Review Receipt Items</h3>
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
              class="flex-1 p-inputtext-sm" 
              @focus="selectAllText"
            />
            <InputNumber 
              v-model="item.price" 
              mode="decimal" 
              :minFractionDigits="2" 
              :maxFractionDigits="2" 
              placeholder="0.00" 
              class="w-28 p-inputtext-sm" 
              :inputStyle="{ width: '100%' }"
              @focus="selectAllText"
            />
            <Button 
              icon="pi pi-trash" 
              class="p-button-danger p-button-text p-button-sm" 
              @click="store.removeItem(item.id)" 
            />
          </div>
        </div>

        <hr class="border-t border-slate-200 dark:border-slate-700 my-2" />

        <!-- Tax & Tip Input panel -->
        <div class="flex gap-3">
          <div class="flex-1 flex flex-col gap-1">
            <div class="flex justify-between items-center">
              <label class="text-xs font-semibold text-secondary">Tax Amount</label>
              <span class="text-[10px] invisible font-bold">&nbsp;</span>
            </div>
            <InputNumber 
              v-model="store.taxInput" 
              mode="decimal" 
              :minFractionDigits="2" 
              :maxFractionDigits="2" 
              class="p-inputtext-sm" 
              :style="{ width: '100%' }"
              :inputStyle="{ width: '100%' }"
              @focus="selectAllText"
            />
          </div>
          <div class="flex-1 flex flex-col gap-1">
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
              class="p-inputtext-sm" 
              :style="{ width: '100%' }"
              :inputStyle="{ width: '100%' }"
              @focus="selectAllText"
            />
          </div>
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

        <!-- Totals Preview card (Receipt Sticker style) -->
        <div class="receipt-totals-sticker">
          <div class="flex justify-between">
            <span>SUBTOTAL:</span>
            <span class="font-bold">{{ store.currencySymbol }}{{ itemsSubtotal.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between">
            <span>TAX:</span>
            <span class="font-bold">{{ store.currencySymbol }}{{ store.taxInput.toFixed(2) }}</span>
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
        <h3 class="font-bold mb-2">Who is Splitting?</h3>
        
        <!-- Quick Split buttons -->
        <div class="mb-2 py-2">
          <div class="flex gap-1 flex-wrap">
            <Button 
              v-for="n in [2, 3, 4, 5, 6, 7, 8, 9, 10]" 
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
              <div class="avatar-badge">{{ getInitials(p.name) }}</div>
              <input 
                v-model="p.name" 
                type="text" 
                class="participant-name-input"
                @change="store.saveToLocalStorage()"
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

        <!-- Add Participant input (at the very bottom) -->
        <div class="flex gap-2 py-2 mt-2">
          <input 
            ref="participantInputRef"
            v-model="newParticipantName" 
            type="text" 
            placeholder="Add custom name..." 
            class="flex-1 p-2 border border-slate-300 dark:border-slate-700 rounded-md bg-transparent text-sm focus:outline-none focus:border-indigo-500" 
            @keyup.enter="addParticipant" 
          />
          <Button 
            label="Add" 
            icon="pi pi-user-plus" 
            class="p-button-sm" 
            @click="addParticipant" 
          />
        </div>
      </div>
    </div>

    <!-- Step 4: Cost Allocation -->
    <div v-else-if="store.step === 'allocate'" class="step-view">
      <div class="mb-2 flex justify-between items-center px-1">
        <div class="text-left">
          <h3 class="font-extrabold text-lg">Assign Items</h3>
          <p class="text-secondary text-xs">Tap an item to select who shares it.</p>
        </div>
        <div class="flex items-center gap-1.5 cursor-pointer select-none" @click="showFullNames = !showFullNames">
          <span class="text-xs font-bold text-secondary uppercase">Full Names</span>
          <i class="pi" :class="showFullNames ? 'pi-check-square text-primary text-sm' : 'pi-stop text-secondary text-sm'"></i>
        </div>
      </div>

      <!-- Scrollable list of items for allocation -->
      <div class="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
        <div 
          v-for="item in store.items" 
          :key="item.id" 
          class="alloc-item-card" 
          @click="openAllocation(item.id)"
        >
          <div class="alloc-item-header">
            <span>{{ item.name }}</span>
            <span class="text-primary">{{ store.currencySymbol }}{{ item.price.toFixed(2) }}</span>
          </div>
          
          <div class="alloc-badges mt-1">
            <!-- Case 1: Everyone or empty (which defaults to everyone) -->
            <span 
              v-if="item.assignedTo.length === store.participants.length || item.assignedTo.length === 0" 
              class="avatar-badge everyone"
            >
              Everyone
            </span>
            
            <!-- Case 2: 50% or greater assigned (Everyone minus the excluded) -->
            <template v-else-if="item.assignedTo.length >= store.participants.length / 2">
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
          </div>
        </div>
      </div>

      <!-- Quick totals visual reference at bottom of allocation -->
      <div class="bill-card bg-slate-50 dark:bg-slate-800/40 mt-2">
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
    </div>

    <!-- Step 5: Final Breakdown and Share -->
    <div v-else-if="store.step === 'share'" class="step-view">
      <div class="text-center">
        <h2 class="text-2xl font-black text-indigo-500">All Splatted! 💸</h2>
        <p class="text-secondary text-sm">Review the proportional split and share.</p>
      </div>

      <!-- Grand breakdown details card -->
      <div class="bill-card">
        <h3 class="font-bold border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">Final Splits</h3>
        
        <div class="flex flex-col gap-3">
          <div 
            v-for="p in billBreakdown" 
            :key="p.id" 
            class="split-badge-row"
          >
            <div class="flex justify-between items-center font-bold text-sm">
              <span class="flex items-center gap-2">
                <span class="avatar-badge">{{ getInitials(p.name) }}</span>
                {{ p.name }}
              </span>
              <span class="text-lg text-primary">{{ store.currencySymbol }}{{ p.total.toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Plain Text Formatting area -->
      <div class="flex flex-col gap-2">
        <label class="text-xs font-semibold text-secondary uppercase tracking-wider">Copied text layout preview</label>
        <div class="summary-text-box">
          {{ shareTextSummary }}
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex flex-col gap-2">
        <Button 
          :label="copySuccess ? 'Copied to Clipboard! ✓' : 'Copy Split Summary'" 
          :icon="copySuccess ? 'pi pi-check' : 'pi pi-copy'" 
          class="w-full p-button-lg"
          :class="copySuccess ? 'p-button-success' : 'p-button-primary'"
          @click="copyToClipboard" 
        />
        <Button 
          label="Start New Split" 
          icon="pi pi-refresh" 
          class="w-full p-button-text" 
          @click="store.reset()" 
        />
      </div>
    </div>

    <!-- Stepper Navigation bar -->
    <nav class="app-nav" v-if="!store.isParsing">
      <Button 
        v-if="store.step !== 'capture'" 
        label="Back" 
        icon="pi pi-chevron-left" 
        class="p-button-text p-button-sm text-secondary" 
        @click="goBack" 
      />
      <div v-else></div> <!-- spacer -->

      <Button 
        v-if="store.step !== 'share'" 
        label="Next" 
        icon="pi pi-chevron-right" 
        iconPos="right" 
        class="p-button-sm" 
        :disabled="!canGoNext" 
        @click="goNext" 
      />
    </nav>

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
        <Button 
          label="Submit" 
          class="p-button-primary w-full mt-1" 
          @click="isAllocationOpen = false" 
        />
      </div>
    </Dialog>

  </main>
</template>

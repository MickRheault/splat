(window as any).__bootstrapStart = performance.now();
console.log('[PERF] main.ts execution started at:', (window as any).__bootstrapStart);

import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import App from './App.vue'
import './style.css'
import 'primeicons/primeicons.css'

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: 'system' // Automatically hooks into system light/dark mode
    }
  }
})

app.mount('#app')

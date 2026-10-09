# 💸 Splat

A progressive web application for splitting receipt bills proportionally (tax and tip) among group members, featuring automated AI OCR scanning.

## Key Features
- **AI OCR Scanning**: Automatically parses receipt items, tax, tip, and currency symbol using Gemini 3.8 Flash.
- **Manual Entry**: Skip OCR and build custom receipts manually.
- **Cost Allocation**: Assign shares to participants using a tactile mobile-friendly interface.
- **Everyone Tag**: Shows unassigned participants as red negative tags when $\ge$ 50% of the group shares an item.
- **Share Summary**: Copies a plain-text breakdown ready to paste into messaging apps.

## Tech Stack
- Vue 3 (Composition API)
- Vite
- PrimeVue & TailwindCSS
- Vitest (Testing suite)
- Gemini API (AI integration)

## Getting Started

### Installation
1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/MickRheault/splat.git
   cd splat
   npm install
   ```

2. Add your Gemini API key:
   ```bash
   cp .env.example .env
   ```
   Add key in `.env`:
   ```env
   VITE_GEMINI_API_KEY=your_key_here
   ```

### Commands
- **Run dev server**: `npm run dev`
- **Run tests**: `npm run test`
- **Production build**: `npm run build`

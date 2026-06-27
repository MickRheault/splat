import { firefox } from 'playwright'
import fs from 'fs'
import path from 'path'

(async () => {
  console.log('🚀 Starting automated screenshot tests...')
  
  // Launch Firefox (configured in Playwright in this environment)
  const browser = await firefox.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12 Pro dimensions (mobile viewport)
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  })
  
  const page = await context.newPage()
  
  // Ensure the screenshots folder exists
  const screenshotsDir = path.join(process.cwd(), 'screenshots')
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir)
  }

  // Helper to wait and take screenshot
  const takeScreenshot = async (name) => {
    await page.waitForTimeout(300) // Let UI render/settle
    const screenshotPath = path.join(screenshotsDir, name)
    await page.screenshot({ path: screenshotPath })
    console.log(`📸 Screenshot saved: ${name}`)
  }

  try {
    console.log('🌐 Navigating to Splat application...')
    await page.goto('http://localhost:5173/')
    
    // Clear localStorage to ensure we start at Step 1
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    
    // Step 1: Capture Landing Screen
    await takeScreenshot('1_capture_step.png')

    // Step 2: Load Brunch Split demo receipt
    console.log('⚡ Loading demo Brunch Split receipt...')
    await page.click('button:has-text("Brunch Split")')
    
    // Capture during simulation loading scanning state
    await page.waitForTimeout(200) // Capture parsing scan animation
    await takeScreenshot('2_ocr_scanning_loading.png')

    // Wait for the simulated OCR parsing to finish (1.5s delay + margin)
    console.log('⏳ Waiting for simulated OCR parser...')
    await page.waitForTimeout(1600)
    await takeScreenshot('3_review_edit_items.png')

    // Step 3: Go to Add People
    console.log('👉 Navigating to Participant management...')
    await page.click('button:has-text("Next")')
    await takeScreenshot('4_participants_step_empty.png')

    // Add Pierre and Luc
    console.log('👤 Adding participants Pierre and Luc...')
    const input = page.locator('input[placeholder="Add participant name..."]')
    await input.fill('Pierre')
    await input.press('Enter')
    await page.waitForTimeout(100)
    
    await input.fill('Luc')
    await input.press('Enter')
    await page.waitForTimeout(100)
    await takeScreenshot('5_participants_step_populated.png')

    // Step 4: Go to Allocation
    console.log('👉 Navigating to Allocation engine...')
    await page.click('button:has-text("Next")')
    await takeScreenshot('6_allocation_step_grid.png')

    // Open Allocation dialog for the first item (Truffle Fries)
    console.log('📋 Opening Allocation Dialog for first item...')
    await page.click('.alloc-item-card:first-child')
    await takeScreenshot('7_allocation_dialog_open.png')

    // Clear everyone from the item and assign only to Pierre
    console.log('👤 Assigning item only to Pierre...')
    await page.click('button:has-text("Clear All")')
    await page.waitForTimeout(100)
    
    // Toggle Pierre (checkmark badge P)
    await page.click('.p-dialog-content .avatar-badge:has-text("P")')
    await takeScreenshot('8_allocation_dialog_custom.png')

    // Close Dialog by pressing Escape
    console.log('❌ Closing dialog...')
    await page.keyboard.press('Escape')
    await takeScreenshot('9_allocation_step_updated.png')

    // Step 5: Go to Share
    console.log('👉 Navigating to Share screen...')
    await page.click('button:has-text("Next")')
    await takeScreenshot('10_final_splits_share.png')

    console.log('✨ All screenshots successfully generated!')
    
  } catch (error) {
    console.error('❌ Error during screenshot run:', error)
  } finally {
    await browser.close()
    console.log('👋 Playwright session closed.')
  }
})()

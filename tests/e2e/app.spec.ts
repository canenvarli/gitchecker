import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'path'

// ---- app lifecycle ---------------------------------------------------------

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist-electron/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Prevent real file scanning during E2E tests
      GC_WATCH_ROOTS: '',
    },
  })

  window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

// ---- window basics ---------------------------------------------------------

test('app launches and shows a window', async () => {
  expect(window).toBeDefined()
  await expect(window).not.toBeNull()
})

test('window has a non-empty title', async () => {
  const title = await window.title()
  expect(title.length).toBeGreaterThan(0)
})

test('title contains GitChecker', async () => {
  const title = await window.title()
  expect(title.toLowerCase()).toContain('gitchecker')
})

// ---- main UI sections ------------------------------------------------------

test('repo list section is visible', async () => {
  // Accept several likely selectors for the repo/sidebar list area
  const repoSection = window
    .locator('[data-testid="repo-list"], [data-testid="sidebar"], aside, [role="list"]')
    .first()

  await expect(repoSection).toBeVisible({ timeout: 10_000 })
})

test('main content / file list area is visible', async () => {
  const mainArea = window
    .locator('[data-testid="file-list"], [data-testid="main-content"], main, section')
    .first()

  await expect(mainArea).toBeVisible({ timeout: 10_000 })
})

// ---- toolbar / action buttons ----------------------------------------------

test('Refresh button is present and clickable', async () => {
  const refreshBtn = window
    .getByRole('button', { name: /refresh/i })
    .or(window.locator('[data-testid="refresh-button"]'))
    .first()

  await expect(refreshBtn).toBeVisible({ timeout: 10_000 })
  // Should be clickable without throwing
  await expect(refreshBtn).toBeEnabled()
})

test('Push All button is present', async () => {
  const pushBtn = window
    .getByRole('button', { name: /push all/i })
    .or(window.locator('[data-testid="push-all-button"]'))
    .first()

  await expect(pushBtn).toBeVisible({ timeout: 10_000 })
})

test('Push All button is disabled when there are no dirty repos', async () => {
  // In test mode with no watch roots, there should be no dirty repos
  const pushBtn = window
    .getByRole('button', { name: /push all/i })
    .or(window.locator('[data-testid="push-all-button"]'))
    .first()

  await expect(pushBtn).toBeVisible({ timeout: 10_000 })

  // It is either disabled or has aria-disabled; allow either
  const isDisabled =
    (await pushBtn.isDisabled()) ||
    (await pushBtn.getAttribute('aria-disabled')) === 'true'

  expect(isDisabled).toBe(true)
})

// ---- status bar ------------------------------------------------------------

test('status bar or footer area is visible at the bottom of the window', async () => {
  const statusBar = window
    .locator('[data-testid="status-bar"], footer, [role="status"], [aria-label*="status" i]')
    .first()

  await expect(statusBar).toBeVisible({ timeout: 10_000 })
})

// ---- interactivity ---------------------------------------------------------

test('clicking Refresh button does not cause an error state', async () => {
  const refreshBtn = window
    .getByRole('button', { name: /refresh/i })
    .or(window.locator('[data-testid="refresh-button"]'))
    .first()

  await refreshBtn.click()

  // After clicking refresh the page should still be visible — no crash
  await expect(window.locator('body')).toBeVisible({ timeout: 5_000 })
})

test('app window is large enough to show content (not collapsed)', async () => {
  const viewportSize = window.viewportSize()
  if (viewportSize) {
    expect(viewportSize.width).toBeGreaterThan(400)
    expect(viewportSize.height).toBeGreaterThan(300)
  }
})

// ---- accessibility basics --------------------------------------------------

test('page has at least one heading', async () => {
  const headings = window.locator('h1, h2, h3, [role="heading"]')
  await expect(headings.first()).toBeVisible({ timeout: 10_000 })
})

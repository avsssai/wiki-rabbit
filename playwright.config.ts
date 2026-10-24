import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    channel: 'chrome',
    reducedMotion: 'reduce',
    headless: true,
  },
  webServer: { command: 'pnpm dev --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 30_000 },
});

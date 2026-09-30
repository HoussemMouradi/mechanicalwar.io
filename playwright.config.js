const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    } : {},
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: 'node scripts/serve.cjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000
  }
});

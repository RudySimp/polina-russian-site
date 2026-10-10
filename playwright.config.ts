import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 3 : undefined,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.PUBLIC_URL || "http://127.0.0.1:4173/polina-russian-site/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "chrome",
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        defaultBrowserType: "chromium",
        channel: process.env.CI ? undefined : "chrome",
      },
    },
  ],
  webServer: process.env.PUBLIC_URL
    ? undefined
    : {
        command: "npm run showcase:preview",
        url: "http://127.0.0.1:4173/polina-russian-site/",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});

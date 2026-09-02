import { defineConfig } from "playwright/test";

const testPort = Number(process.env.PROFAB_TEST_PORT || "3000");
const testBaseURL = `http://localhost:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./tmp/playwright-results",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "./tmp/playwright-report.json" }],
  ],
  use: {
    baseURL: testBaseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: testBaseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        },
      },
    },
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3003",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- -p 3003",
    url: "http://localhost:3003/login",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
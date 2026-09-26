import { defineConfig, devices } from "@playwright/test";

function readEnvironmentValue(key: string): string | undefined {
  return (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env
    .get(key) ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
      key
    ];
}

const isCi = Boolean(readEnvironmentValue("CI"));
const webServerCommand = readEnvironmentValue("PLAYWRIGHT_WEB_SERVER_COMMAND") ??
  "pnpm build && pnpm preview";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: webServerCommand,
    port: 4173,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

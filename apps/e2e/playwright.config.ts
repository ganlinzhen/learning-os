import { defineConfig } from "@playwright/test";
import { join } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "../../.venv/bin/python -m uvicorn learning_os_generator.api.app:app --app-dir src --host 127.0.0.1 --port 8001",
      cwd: join(process.cwd(), "..", "generator"),
      port: 8001,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "pnpm --filter @learning-os/server dev",
      cwd: join(process.cwd(), "..", ".."),
      port: 3001,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        LEARNING_OS_API_PORT: "3001",
        LEARNING_OS_AGENT_URL: "http://127.0.0.1:8001",
        LEARNING_OS_ROOT_DIR: join(process.cwd(), ".tmp", "learning-os-e2e"),
      },
    },
    {
      command: "pnpm --filter @learning-os/console dev --host 127.0.0.1 --port 4173",
      cwd: join(process.cwd(), "..", ".."),
      port: 4173,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: "http://127.0.0.1:3001",
      },
    },
  ],
});

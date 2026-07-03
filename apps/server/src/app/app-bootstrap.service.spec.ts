import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppBootstrapService } from "./app-bootstrap.service";

describe("AppBootstrapService", () => {
  it("creates required learning os directories", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-"));
    const service = new AppBootstrapService(rootDir);

    await service.ensureDirectories();

    expect(existsSync(join(rootDir, "sources"))).toBe(true);
    expect(existsSync(join(rootDir, "notes"))).toBe(true);
    expect(existsSync(join(rootDir, "logs"))).toBe(true);
  });
});

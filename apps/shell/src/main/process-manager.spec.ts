import { describe, expect, it, vi } from "vitest";
import { ProcessManager } from "./process-manager.js";

describe("ProcessManager", () => {
  it("skips managed services outside production mode", () => {
    const spawnMock = vi.fn();

    const manager = new ProcessManager(spawnMock as any, false);
    manager.startAll();

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("starts server and generator commands in production mode", () => {
    const spawnMock = vi.fn().mockReturnValue({ on: vi.fn(), kill: vi.fn() });
    const manager = new ProcessManager(spawnMock as any, true);

    manager.startAll();

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("stops managed child processes", () => {
    const firstChild = { on: vi.fn(), kill: vi.fn() };
    const secondChild = { on: vi.fn(), kill: vi.fn() };
    const spawnMock = vi.fn().mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const manager = new ProcessManager(spawnMock as any, true);

    manager.startAll();
    manager.stopAll();

    expect(firstChild.kill).toHaveBeenCalled();
    expect(secondChild.kill).toHaveBeenCalled();
  });
});

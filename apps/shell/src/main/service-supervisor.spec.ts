import { describe, expect, it, vi } from "vitest";
import { ServiceSupervisor } from "./service-supervisor.js";

describe("ServiceSupervisor", () => {
  it("启动 generator 与 server 并等待健康检查通过", async () => {
    const spawnMock = vi.fn().mockReturnValue({ kill: vi.fn() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const supervisor = new ServiceSupervisor(spawnMock as any, fetchMock as any);

    await supervisor.start({
      generator: { command: "generator-bin", args: [], cwd: "/tmp/generator", env: {} },
      server: { command: "node", args: ["dist/main.js"], cwd: "/tmp/server", env: {} },
      healthChecks: ["http://127.0.0.1:8000/health", "http://127.0.0.1:3000/health"],
    });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("健康检查一直失败时抛出错误", async () => {
    const spawnMock = vi.fn().mockReturnValue({ kill: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    const supervisor = new ServiceSupervisor(spawnMock as any, fetchMock as any);

    await expect(
      supervisor.start({
        generator: { command: "generator-bin", args: [], cwd: "/tmp/generator", env: {} },
        server: { command: "node", args: ["dist/main.js"], cwd: "/tmp/server", env: {} },
        healthChecks: ["http://127.0.0.1:8000/health"],
        maxAttempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("service_check_failed:http://127.0.0.1:8000/health");
  });

  it("停止时会关闭所有托管子进程", async () => {
    const generatorChild = { kill: vi.fn() };
    const serverChild = { kill: vi.fn() };
    const spawnMock = vi.fn().mockReturnValueOnce(generatorChild).mockReturnValueOnce(serverChild);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const supervisor = new ServiceSupervisor(spawnMock as any, fetchMock as any);

    await supervisor.start({
      generator: { command: "generator-bin", args: [], cwd: "/tmp/generator", env: {} },
      server: { command: "node", args: ["dist/main.js"], cwd: "/tmp/server", env: {} },
      healthChecks: ["http://127.0.0.1:8000/health", "http://127.0.0.1:3000/health"],
    });

    supervisor.stop();

    expect(generatorChild.kill).toHaveBeenCalledWith("SIGTERM");
    expect(serverChild.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

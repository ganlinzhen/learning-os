import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "./router";

vi.mock("../shared/api/api-client", () => ({
  apiClient: { getLlmSettings: vi.fn() },
}));

beforeEach(async () => {
  const { apiClient } = await import("../shared/api/api-client");
  vi.mocked(apiClient.getLlmSettings).mockResolvedValue({
    provider: "deepseek",
    apiKeyConfigured: true,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  });
});

describe("console routes", () => {
  it("exposes top-level shell route and primary children", () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/");
    expect(routes[0]?.children?.map((route) => ("index" in route && route.index ? "index" : route.path))).toEqual([
      "index",
      "ingestions/:sessionId",
      "library",
      "concepts/:conceptId",
      "review",
      "search",
      "settings",
    ]);
  });

  it("在 /settings 路由渲染设置页面", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/settings"] });
    render(
      <RouterProvider router={router} />,
    );

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/settings");
  });
});

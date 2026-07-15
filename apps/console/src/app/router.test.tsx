import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";
import { routes } from "./router";

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

  it("在侧栏中提供设置入口", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
  });
});

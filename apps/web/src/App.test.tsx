import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })),
    );
  });

  it("shows login when unauthenticated", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("renders lab when token present", async () => {
    localStorage.setItem("quantlab_token", "test");
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            models: {
              primary: "gemini-3.8-flash",
              lite: "gemini-3.1-flash-lite",
              deepseek_model: "deepseek-chat",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/runs/templates")) {
        return new Response(
          JSON.stringify({
            templates: [{ id: "trend_vt", name: "趋势 + 波动目标" }],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "实验室" })).toBeInTheDocument();
    expect(await screen.findByText(/趋势 \+ 波动目标/)).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n";

vi.mock("react-resizable-panels", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Group: Pass,
    Panel: Pass,
    Separator: () => <div data-separator />,
    useDefaultLayout: () => ({
      defaultLayout: undefined,
      onLayoutChanged: () => undefined,
    }),
  };
});

import { App } from "./App";

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })),
    );
  });

  it("shows landing when visiting /", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", {
        name: /Research terminal for backtests you can read/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders workspace without forcing login", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ready")) {
        return new Response(
          JSON.stringify({
            status: "ready",
            database: "ok",
            data_source: { fixture_ok: true },
            llm: { primary: "gemini-3.8-flash" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/runs/templates")) {
        return new Response(
          JSON.stringify({
            templates: [{ id: "trend_vt", name: "Trend + Vol Target", tickers: ["SPY"] }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/runs")) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/workspace"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Run backtest/i)).toBeInTheDocument();
    expect(await screen.findByText(/Trend \+ Vol Target/)).toBeInTheDocument();
  });
});

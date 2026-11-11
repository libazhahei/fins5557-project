/// <reference lib="webworker" />
import type { IndicatorRequest, IndicatorResult, WorkerRequest, WorkerResponse } from "./types";
import { computeWickra } from "./mapWickra";

let wickraReady: Promise<typeof import("wickra-wasm")> | null = null;
let quantReady: Promise<{ compute: (req: unknown) => unknown }> | null = null;

async function loadWickra() {
  if (!wickraReady) {
    wickraReady = import("wickra-wasm");
  }
  return wickraReady;
}

async function loadQuant() {
  if (!quantReady) {
    quantReady = (async () => {
      const mod = await import("./pkg/quant_wasm.js");
      await mod.default();
      return { compute: mod.compute as (req: unknown) => unknown };
    })();
  }
  return quantReady;
}

function mergeResults(a: IndicatorResult, b: Partial<IndicatorResult>): IndicatorResult {
  return {
    series: [...(a.series || []), ...(b.series || [])],
    profiles: [...(a.profiles || []), ...(b.profiles || [])],
    structures: [...(a.structures || []), ...(b.structures || [])],
    bands: [...(a.bands || []), ...((b.bands || []) as IndicatorResult["bands"])],
    clouds: [...(a.clouds || []), ...(b.clouds || [])],
    scalars: { ...(a.scalars || {}), ...(b.scalars || {}) },
  };
}

async function runCompute(payload: IndicatorRequest): Promise<IndicatorResult> {
  const W = await loadWickra();
  let result = computeWickra(W, payload);

  const customIds = payload.enabled.filter((id) =>
    ["kalman", "smc", "chan", "mc"].includes(id),
  );
  if (customIds.length) {
    try {
      const Q = await loadQuant();
      const resp = Q.compute({
        bars: payload.bars.map((b) => ({
          time: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? 0,
        })),
        enabled: customIds,
        params: payload.params || {},
        view: payload.view || null,
        benchmark_closes: payload.benchmarkCloses || null,
      }) as IndicatorResult;
      result = mergeResults(result, resp || {});
    } catch (err) {
      console.error("quant-wasm compute failed", err);
    }
  }
  return result;
}

const post = (msg: WorkerResponse) => self.postMessage(msg);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== "compute") return;
  void runCompute(msg.payload)
    .then((result) => post({ type: "result", id: msg.id, result }))
    .catch((err: Error) =>
      post({ type: "error", id: msg.id, message: err?.message || String(err) }),
    );
};

void Promise.all([loadWickra(), loadQuant()])
  .then(() => post({ type: "ready" }))
  .catch(() => post({ type: "ready" }));

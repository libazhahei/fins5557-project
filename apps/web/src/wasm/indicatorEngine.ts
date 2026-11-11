import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IndicatorId,
  IndicatorRequest,
  IndicatorResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { DEFAULT_ENABLED } from "./types";

const EMPTY: IndicatorResult = {
  series: [],
  profiles: [],
  structures: [],
  bands: [],
  clouds: [],
  scalars: {},
};

async function computeOnMainThread(payload: IndicatorRequest): Promise<IndicatorResult> {
  const [{ computeWickra }, wickra] = await Promise.all([
    import("./mapWickra"),
    import("wickra-wasm"),
  ]);
  let result = computeWickra(wickra, payload);
  const customIds = payload.enabled.filter((id) =>
    ["kalman", "smc", "chan", "mc", "arima", "hv_ewma", "wasm_arima", "wasm_hv_ewma"].includes(
      id,
    ),
  );
  if (customIds.length) {
    try {
      const mod = await import("./pkg/quant_wasm.js");
      await mod.default();
      const resp = mod.compute({
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
        view: payload.view
          ? { from_idx: payload.view.fromIdx, to_idx: payload.view.toIdx }
          : null,
        benchmark_closes: payload.benchmarkCloses || null,
      }) as IndicatorResult;
      result = {
        series: [...result.series, ...(resp?.series || [])],
        profiles: [...result.profiles, ...(resp?.profiles || [])],
        structures: [...result.structures, ...(resp?.structures || [])],
        bands: [...result.bands, ...((resp?.bands || []) as IndicatorResult["bands"])],
        clouds: [...(result.clouds || []), ...(resp?.clouds || [])],
        scalars: { ...(result.scalars || {}), ...(resp?.scalars || {}) },
      };
    } catch (err) {
      console.warn("quant-wasm main-thread failed", err);
    }
  }
  return result;
}

export function useIndicatorEngine() {
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);
  const pending = useRef(new Map<number, (r: IndicatorResult) => void>());
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [enabled, setEnabled] = useState<IndicatorId[]>(DEFAULT_ENABLED);
  const [result, setResult] = useState<IndicatorResult>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const useWorker = useRef(true);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./indicatorWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      console.warn("indicator worker unavailable, using main thread", err);
      useWorker.current = false;
      readyRef.current = true;
      setReady(true);
      return;
    }
    workerRef.current = worker;
    const boot = window.setTimeout(() => {
      if (!readyRef.current) {
        useWorker.current = false;
        readyRef.current = true;
        setReady(true);
      }
    }, 4000);
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === "ready") {
        window.clearTimeout(boot);
        readyRef.current = true;
        setReady(true);
        return;
      }
      if (msg.type === "error") {
        setError(msg.message);
        useWorker.current = false;
        pending.current.get(msg.id)?.(EMPTY);
        pending.current.delete(msg.id);
        return;
      }
      if (msg.type === "result") {
        setError(null);
        setResult(msg.result);
        if (!(msg.result.series?.length || msg.result.structures?.length || msg.result.profiles?.length)) {
          // empty — keep worker but allow caller to retry; don't force fallback yet
        }
        pending.current.get(msg.id)?.(msg.result);
        pending.current.delete(msg.id);
      }
    };
    worker.onerror = (e) => {
      window.clearTimeout(boot);
      setError(e.message || "indicator worker error");
      useWorker.current = false;
      readyRef.current = true;
      setReady(true);
    };
    return () => {
      window.clearTimeout(boot);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const compute = useCallback(
    (payload: Omit<IndicatorRequest, "enabled"> & { enabled?: IndicatorId[] }) => {
      const full: IndicatorRequest = {
        ...payload,
        enabled: payload.enabled ?? enabled,
      };
      if (!full.enabled.length || !full.bars.length) {
        setResult(EMPTY);
        return;
      }

      const runMain = () => {
        void computeOnMainThread(full)
          .then((r) => {
            setError(null);
            setResult(r);
          })
          .catch((err: Error) => {
            setError(err?.message || String(err));
            setResult(EMPTY);
          });
      };

      if (!useWorker.current || !workerRef.current) {
        runMain();
        return;
      }

      const id = ++seq.current;
      const req: WorkerRequest = { type: "compute", id, payload: full };
      try {
        workerRef.current.postMessage(req);
        // If worker returns empty series while indicators requested, fall back once
        pending.current.set(id, (r) => {
          const want = full.enabled.some((x) => !["vol"].includes(x));
          const wantPredBands = full.enabled.some((x) =>
            ["arima", "hv_ewma", "mc", "wasm_arima", "wasm_hv_ewma"].includes(x),
          );
          const missingPred =
            wantPredBands && !(r.bands && r.bands.length);
          if (
            missingPred ||
            (want &&
              !(r.series?.length || r.profiles?.length || r.structures?.length || r.bands?.length))
          ) {
            useWorker.current = false;
            runMain();
          }
        });
      } catch {
        useWorker.current = false;
        runMain();
      }
    },
    [enabled],
  );

  const toggle = useCallback((id: IndicatorId) => {
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const setAll = useCallback((ids: IndicatorId[]) => setEnabled(ids), []);

  return { ready, enabled, result, error, compute, toggle, setAll };
}

declare module "./pkg/quant_wasm.js" {
  export function compute(req: unknown): unknown;
  export function start(): void;
  export default function init(
    module_or_path?: unknown,
  ): Promise<unknown>;
}

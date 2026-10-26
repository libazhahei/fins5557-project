/** HTTP tools that call Quant Lab API (user JWT required). */

export type ToolContext = {
  apiBaseUrl: string;
  userToken: string;
  serviceSecret: string;
};

async function api(
  ctx: ToolContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${ctx.apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.userToken}`,
      "Content-Type": "application/json",
      "X-Service-Secret": ctx.serviceSecret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

export const toolDefs = [
  {
    name: "list_templates",
    description: "List available backtest templates for beginners",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "run_template",
    description: "Run a named backtest template (buy_hold | sixty_forty | trend_vt)",
    parameters: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template id" },
        use_fixtures: { type: "boolean", description: "Use offline CSV fixtures" },
      },
      required: ["template"],
    },
  },
  {
    name: "get_run",
    description: "Fetch a run by id including summary metrics",
    parameters: {
      type: "object",
      properties: { run_id: { type: "string" } },
      required: ["run_id"],
    },
  },
  {
    name: "list_runs",
    description: "List recent experiment runs for the user",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_job",
    description: "Create a single pipeline job (e.g. montecarlo.run, indicators.compute)",
    parameters: {
      type: "object",
      properties: {
        job_type: { type: "string" },
        params: { type: "object" },
        input_uris: { type: "array", items: { type: "string" } },
        execute_now: { type: "boolean" },
      },
      required: ["job_type"],
    },
  },
  {
    name: "get_job",
    description: "Get job status and metrics",
    parameters: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
  },
] as const;

export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_templates":
      return api(ctx, "GET", "/runs/templates");
    case "run_template":
      return api(ctx, "POST", "/runs/from-template", {
        template: args.template,
        use_fixtures: args.use_fixtures ?? true,
      });
    case "get_run":
      return api(ctx, "GET", `/runs/${args.run_id}`);
    case "list_runs":
      return api(ctx, "GET", "/runs");
    case "create_job":
      return api(ctx, "POST", "/jobs", {
        job_type: args.job_type,
        params: args.params ?? {},
        input_uris: args.input_uris ?? [],
        execute_now: args.execute_now ?? true,
      });
    case "get_job":
      return api(ctx, "GET", `/jobs/${args.job_id}`);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

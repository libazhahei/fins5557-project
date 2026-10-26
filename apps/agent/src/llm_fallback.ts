/**
 * OpenAI-compatible tool loop used when Pi SDK is unavailable OR for tests.
 * Supports DeepSeek and Gemini (via OpenAI-compatible endpoints).
 */

import { executeTool, toolDefs, type ToolContext } from "./tools.js";
import { config } from "./config.js";

type Msg = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

function endpoint(provider: string): { url: string; key: string; model: string } {
  if (provider === "deepseek") {
    return {
      url: "https://api.deepseek.com/chat/completions",
      key: config.deepseekApiKey,
      model: config.deepseekModel,
    };
  }
  // Google Gemini OpenAI-compatible
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    key: config.geminiApiKey,
    model: config.primaryModel,
  };
}

const SYSTEM = `You are Quant Lab assistant for personal researchers and quant beginners.
Use tools to run templates, inspect runs/jobs. Reply in Chinese by default.
Never promise returns. Always note research-only disclaimer briefly.
Prefer template trend_vt for "趋势+波动" style requests.`;

export async function runFallbackAgent(opts: {
  provider: string;
  model?: string;
  message: string;
  history: Msg[];
  toolCtx: ToolContext;
  onEvent?: (ev: Record<string, unknown>) => void;
}): Promise<{ text: string; history: Msg[] }> {
  const ep = endpoint(opts.provider);
  if (!ep.key) {
    // Deterministic offline reply for local/dev without keys
    const lower = opts.message.toLowerCase();
    if (lower.includes("模板") || lower.includes("template") || lower.includes("回测")) {
      opts.onEvent?.({ type: "tool_start", name: "run_template" });
      try {
        const result = await executeTool(opts.toolCtx, "run_template", {
          template: "trend_vt",
          use_fixtures: true,
        });
        opts.onEvent?.({ type: "tool_end", name: "run_template", result });
        const text = `已用离线模式运行「趋势 + 波动目标」模板。\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 2000)}\n\`\`\`\n（未配置 API Key 时走规则回退；配置 DEEPSEEK_API_KEY / GEMINI_API_KEY 后将使用模型。）`;
        return { text, history: [...opts.history, { role: "user", content: opts.message }, { role: "assistant", content: text }] };
      } catch (e) {
        const text = `无法跑模板：${e instanceof Error ? e.message : String(e)}`;
        return { text, history: opts.history };
      }
    }
    const text =
      "当前未配置 LLM API Key。可说「帮我跑趋势回测」触发离线模板，或设置 GEMINI_API_KEY / DEEPSEEK_API_KEY。";
    return { text, history: [...opts.history, { role: "user", content: opts.message }, { role: "assistant", content: text }] };
  }

  const tools = toolDefs.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let messages: Msg[] = [
    { role: "system", content: SYSTEM },
    ...opts.history,
    { role: "user", content: opts.message },
  ];

  for (let step = 0; step < 8; step++) {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ep.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model || ep.model,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM ${opts.provider} ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const data = (await res.json()) as any;
    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error("empty LLM response");
    messages.push(choice);
    opts.onEvent?.({ type: "message", role: "assistant", content: choice.content });

    const calls = choice.tool_calls as any[] | undefined;
    if (!calls?.length) {
      return { text: choice.content || "", history: messages.filter((m) => m.role !== "system") };
    }
    for (const call of calls) {
      const name = call.function?.name as string;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      opts.onEvent?.({ type: "tool_start", name, args });
      let result: unknown;
      try {
        result = await executeTool(opts.toolCtx, name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      opts.onEvent?.({ type: "tool_end", name, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: JSON.stringify(result),
      });
    }
  }
  return { text: "工具调用轮次过多，已停止。", history: messages.filter((m) => m.role !== "system") };
}

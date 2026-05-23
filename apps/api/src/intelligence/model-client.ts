export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelResult = {
  modelId: string;
  content: string;
};

const DEFAULT_MODEL = "llama3.2:1b";
const DEFAULT_KEEP_ALIVE = "30m";
const DEFAULT_NUM_CTX = 4096;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_NUM_PREDICT = 384;
const DEFAULT_CHAT_TIMEOUT_MS = 240_000;
const DEFAULT_PREWARM_TIMEOUT_MS = 45_000;

export function getConfiguredModelId() {
  return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
}

export function getConfiguredKeepAlive() {
  return process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE;
}

function getBaseUrl() {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

function getChatTimeoutMs() {
  const raw = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS ?? DEFAULT_CHAT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHAT_TIMEOUT_MS;
}

export async function runLocalChat(messages: ModelMessage[]): Promise<ModelResult> {
  const model = getConfiguredModelId();
  const baseUrl = getBaseUrl();
  const timeoutMs = getChatTimeoutMs();
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: "json",
        keep_alive: getConfiguredKeepAlive(),
        options: {
          temperature: DEFAULT_TEMPERATURE,
          num_ctx: DEFAULT_NUM_CTX,
          num_predict: DEFAULT_NUM_PREDICT
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(formatRuntimeError(error, baseUrl, model, timeoutMs));
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local model request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) {
    throw new Error("Local model returned an empty response");
  }

  return { modelId: model, content };
}

export async function prewarmLocalModel() {
  const model = getConfiguredModelId();
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: getConfiguredKeepAlive(),
        messages: [
          {
            role: "system",
            content: "You are warming up for future requests."
          },
          {
            role: "user",
            content: "Reply with ready."
          }
        ],
        options: {
          temperature: 0,
          num_ctx: 256,
          num_predict: 8
        }
      }),
      signal: AbortSignal.timeout(DEFAULT_PREWARM_TIMEOUT_MS)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Warm request failed: ${response.status} ${body}`);
    }
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Unable to prewarm local AI runtime at ${baseUrl} for ${model}`
    );
  }
}

function formatRuntimeError(error: unknown, baseUrl: string, model: string, timeoutMs: number) {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return `Local model request timed out after ${Math.round(
      timeoutMs / 1000
    )}s while generating a policy read at ${baseUrl} using ${model}.`;
  }

  return `Local AI runtime is unavailable at ${baseUrl}. Start Ollama and run: ollama pull ${model}`;
}

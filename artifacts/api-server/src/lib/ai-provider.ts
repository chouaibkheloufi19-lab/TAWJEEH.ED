export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const CHAT_TIMEOUT_MS = 45_000;
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

export class DeepSeekProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "DeepSeekProviderError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`DeepSeek request timed out after ${milliseconds}ms`));
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function readProviderError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return body.replace(/\s+/g, " ").trim().slice(0, 320);
}

export async function callDeepSeekTextModel(
  messages: ChatMessage[],
  options: { temperature: number; maxOutputTokens: number; jsonMode?: boolean },
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new DeepSeekProviderError("DEEPSEEK_API_KEY is not configured");
  }
  const baseUrl = (
    process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL
  ).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
  let response: Response;
  try {
    response = await withTimeout(
      fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature,
          max_tokens: options.maxOutputTokens,
          messages,
          ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      }),
      CHAT_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(message, { retryable: true });
  }

  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new DeepSeekProviderError(
      `DeepSeek provider responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
      {
        status: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      },
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(`DeepSeek provider returned invalid JSON: ${message}`, {
      status: response.status,
      retryable: true,
    });
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new DeepSeekProviderError("DeepSeek provider returned no content", {
      status: response.status,
      retryable: true,
    });
  }
  return content.trim();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function callDeepSeekTextModelWithRetry(
  messages: ChatMessage[],
  options: { temperature: number; maxOutputTokens: number; jsonMode?: boolean },
  retryOptions: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<string> {
  const maxAttempts = Math.max(1, Math.min(retryOptions.maxAttempts ?? 3, 4));
  const baseDelayMs = Math.max(100, retryOptions.baseDelayMs ?? 500);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callDeepSeekTextModel(messages, options);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof DeepSeekProviderError && error.retryable;
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("DeepSeek request failed");
}
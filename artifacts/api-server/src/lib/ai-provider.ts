import { ReplitConnectors } from "@replit/connectors-sdk";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const CHAT_TIMEOUT_MS = 45_000;
const XAI_CONNECTOR = "xai";
const DEFAULT_XAI_MODEL = "grok-3-mini";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const connectors = new ReplitConnectors();
let discoveredModel: string | null = null;

export class DeepSeekProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "DeepSeekProviderError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`xAI request timed out after ${milliseconds}ms`));
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

function isConnectionError(message: string): boolean {
  return /unauthenticated|no[- ]credentials|not connected|connection (?:not found|not configured|failed|refused|reset)|credentials? (?:missing|invalid|not found)|incorrect api key|invalid api key|api key (?:provided|missing|not found)/i.test(
    message,
  );
}

function hasDeepSeekCredentials(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

async function callDeepSeekApi(
  messages: ChatMessage[],
  options: { temperature: number; maxOutputTokens: number; jsonMode?: boolean },
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new DeepSeekProviderError("DEEPSEEK_API_KEY is not configured", {
      status: 401,
    });
  }

  let response: Response;
  try {
    response = await withTimeout(
      fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
          temperature: options.temperature,
          max_tokens: options.maxOutputTokens,
          messages,
          ...(options.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      }),
      CHAT_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(
      isConnectionError(message)
        ? "DEEPSEEK_CONNECTION_NOT_CONFIGURED"
        : `DeepSeek request failed: ${message}`,
      {
        retryable: !isConnectionError(message),
        status: isConnectionError(message) ? 401 : undefined,
      },
    );
  }

  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new DeepSeekProviderError(
      response.status === 401 ||
        response.status === 403 ||
        isConnectionError(providerError)
        ? "DEEPSEEK_CONNECTION_NOT_CONFIGURED"
        : `DeepSeek provider responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
      {
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      },
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(
      `DeepSeek provider returned invalid JSON: ${message}`,
      {
        status: response.status,
        retryable: true,
      },
    );
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

async function discoverXaiModel(): Promise<string> {
  const configuredModel =
    process.env.XAI_MODEL?.trim() || process.env.GROK_TEXT_MODEL?.trim();
  if (configuredModel) return configuredModel;
  if (discoveredModel) return discoveredModel;

  let response: Response;
  try {
    response = await withTimeout(
      connectors.proxy(XAI_CONNECTOR, "/v1/language-models", {
        method: "GET",
      }),
      CHAT_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(
      isConnectionError(message)
        ? "XAI_CONNECTION_NOT_CONFIGURED"
        : `xAI model discovery failed: ${message}`,
      {
        retryable: !isConnectionError(message),
        status: isConnectionError(message) ? 401 : undefined,
      },
    );
  }

  if (!response.ok) {
    const providerError = await readProviderError(response);
    if (
      response.status === 401 ||
      response.status === 403 ||
      isConnectionError(providerError)
    ) {
      throw new DeepSeekProviderError("XAI_CONNECTION_NOT_CONFIGURED", {
        status: response.status,
      });
    }
    throw new DeepSeekProviderError(
      `xAI model discovery responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
      {
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      },
    );
  }

  const payload = (await response.json()) as {
    models?: Array<{
      id?: unknown;
      input_modalities?: unknown;
      output_modalities?: unknown;
    }>;
  };
  const models = Array.isArray(payload.models) ? payload.models : [];
  const textModels = models
    .filter((model) => {
      const id = typeof model.id === "string" ? model.id : "";
      const inputModalities = Array.isArray(model.input_modalities)
        ? model.input_modalities
        : [];
      const outputModalities = Array.isArray(model.output_modalities)
        ? model.output_modalities
        : [];
      return (
        id.length > 0 &&
        !/image|video|embedding/i.test(id) &&
        (inputModalities.length === 0 || inputModalities.includes("text")) &&
        (outputModalities.length === 0 || outputModalities.includes("text"))
      );
    })
    .map((model) => model.id as string);
  const selectedModel =
    textModels.find((model) => /grok-3-mini|grok-4/i.test(model)) ||
    textModels[0] ||
    DEFAULT_XAI_MODEL;
  discoveredModel = selectedModel;
  return selectedModel;
}

export async function callDeepSeekTextModel(
  messages: ChatMessage[],
  options: { temperature: number; maxOutputTokens: number; jsonMode?: boolean },
): Promise<string> {
  if (hasDeepSeekCredentials()) {
    return callDeepSeekApi(messages, options);
  }

  const model = await discoverXaiModel();
  let response: Response;
  try {
    response = await withTimeout(
      connectors.proxy(XAI_CONNECTOR, "/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: options.temperature,
          max_tokens: options.maxOutputTokens,
          messages,
          ...(options.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      }),
      CHAT_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(
      isConnectionError(message)
        ? "XAI_CONNECTION_NOT_CONFIGURED"
        : `xAI request failed: ${message}`,
      {
        retryable: !isConnectionError(message),
        status: isConnectionError(message) ? 401 : undefined,
      },
    );
  }

  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new DeepSeekProviderError(
      response.status === 401 ||
        response.status === 403 ||
        isConnectionError(providerError)
        ? "XAI_CONNECTION_NOT_CONFIGURED"
        : `xAI provider responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
      {
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      },
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeepSeekProviderError(
      `xAI provider returned invalid JSON: ${message}`,
      {
        status: response.status,
        retryable: true,
      },
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new DeepSeekProviderError("xAI provider returned no content", {
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
      const retryable =
        error instanceof DeepSeekProviderError && error.retryable;
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("xAI request failed");
}

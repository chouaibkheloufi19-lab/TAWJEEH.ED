import { ReplitConnectors } from "@replit/connectors-sdk";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LanguageModel = {
  id?: unknown;
  input_modalities?: unknown;
  output_modalities?: unknown;
};

type LanguageModelsResponse = {
  models?: unknown;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 30_000;
const MODEL_CACHE_TTL_MS = 10 * 60_000;

let cachedTextModel: { id: string; expiresAt: number } | undefined;

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

function supportsText(model: LanguageModel): boolean {
  const inputs = Array.isArray(model.input_modalities) ? model.input_modalities : [];
  const outputs = Array.isArray(model.output_modalities) ? model.output_modalities : [];
  return (
    inputs.includes("text") &&
    outputs.includes("text") &&
    typeof model.id === "string" &&
    !/vision|image|video/i.test(model.id)
  );
}

async function resolveTextModel(): Promise<string> {
  const configuredModel = process.env.XAI_MODEL ?? process.env.GROK_TEXT_MODEL;
  if (configuredModel?.trim()) return configuredModel.trim();

  if (cachedTextModel && cachedTextModel.expiresAt > Date.now()) {
    return cachedTextModel.id;
  }

  const connectors = new ReplitConnectors();
  const response = await withTimeout(
    connectors.proxy("xai", "/v1/language-models", { method: "GET" }),
    MODEL_DISCOVERY_TIMEOUT_MS,
  );
  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new Error(
      `xAI model discovery responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
    );
  }

  const payload = (await response.json()) as LanguageModelsResponse;
  const models = Array.isArray(payload.models)
    ? payload.models.filter((model): model is LanguageModel => Boolean(model) && typeof model === "object")
    : [];
  const textModel = models.find(supportsText);
  if (!textModel || typeof textModel.id !== "string") {
    throw new Error("xAI returned no compatible text model");
  }

  cachedTextModel = {
    id: textModel.id,
    expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
  };
  return textModel.id;
}

export async function callXaiTextModel(
  messages: ChatMessage[],
  options: { temperature: number; maxOutputTokens: number },
): Promise<string> {
  const connectors = new ReplitConnectors();
  const model = await resolveTextModel();
  const response = await withTimeout(
    connectors.proxy("xai", "/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: options.temperature,
        max_completion_tokens: options.maxOutputTokens,
        messages,
      }),
    }),
    CHAT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new Error(
      `xAI provider responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("xAI provider returned no content");
  }
  return content.trim();
}
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const CHAT_TIMEOUT_MS = 45_000;
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

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
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  const baseUrl = (
    process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL
  ).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
  const response = await withTimeout(
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
  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new Error(
      `DeepSeek provider responded with ${response.status}${providerError ? `: ${providerError}` : ""}`,
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek provider returned no content");
  }
  return content.trim();
}
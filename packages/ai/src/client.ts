import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MAX_TOKENS, MODEL, isConfigured, type AiFeature } from "./config";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiResult {
  text: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
  /** True when the response came from the offline stub rather than the API. */
  stubbed: boolean;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isConfigured()) throw new AiNotConfiguredError();
  // The zero-arg constructor resolves ANTHROPIC_API_KEY itself.
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

export interface StreamOptions {
  feature: AiFeature;
  system: string;
  prompt: string;
}

/**
 * Runs a feature and streams the text back.
 *
 * Returns both a ReadableStream for the HTTP response and a promise that
 * settles once generation finishes, carrying the full text and token usage so
 * the caller can cache the output and record what it cost.
 */
export function streamCompletion(options: StreamOptions): {
  stream: ReadableStream<Uint8Array>;
  result: Promise<AiResult>;
} {
  if (!isConfigured()) {
    return stubCompletion(options.feature);
  }

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  let settle: (result: AiResult) => void;
  let fail: (err: unknown) => void;
  const result = new Promise<AiResult>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const messageStream = getClient().messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS[options.feature],
          // Adaptive thinking is the default on this model family; being
          // explicit documents the intent. Depth is steered by effort.
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT[options.feature] },
          system: [
            {
              type: "text",
              text: options.system,
              // Stable across every request for this feature. Short prompts
              // fall under the minimum cacheable prefix, so this only starts
              // paying once problems carry long editorials.
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: options.prompt }],
        });

        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await messageStream.finalMessage();

        if (final.stop_reason === "refusal") {
          const message =
            "\n\n_The model declined to answer this request._";
          controller.enqueue(encoder.encode(message));
          text += message;
        }

        controller.close();
        settle!({
          text,
          model: final.model,
          usage: {
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
          },
          latencyMs: Date.now() - startedAt,
          stubbed: false,
        });
      } catch (err) {
        const message = describeError(err);
        controller.enqueue(encoder.encode(`\n\n**AI unavailable:** ${message}`));
        controller.close();
        fail!(err);
      }
    },
  });

  // Nothing may be listening for failures; the route logs them itself.
  result.catch(() => {});

  return { stream, result };
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "the configured ANTHROPIC_API_KEY was rejected.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "rate limited by the Claude API — try again shortly.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Claude API error ${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : "unknown error";
}

/**
 * Offline mode. The repo should be runnable by someone who just cloned it and
 * has no API key, so the AI endpoints degrade to an honest placeholder rather
 * than a 500.
 */
const STUBS: Record<AiFeature, string> = {
  HINT: `_AI hints are not configured on this instance._

Set \`ANTHROPIC_API_KEY\` in \`apps/web/.env\` to enable tiered hints. Hints are
graded from a one-line nudge up to pseudocode, and each tier taken reduces the
contest points awarded for the problem.`,
  REVIEW: `_AI review is not configured on this instance._

Set \`ANTHROPIC_API_KEY\` in \`apps/web/.env\` to get a complexity analysis,
missed-edge-case report, and idiomatic rewrite suggestions for accepted
submissions.`,
  EXPLAIN: `_AI failure analysis is not configured on this instance._

Set \`ANTHROPIC_API_KEY\` in \`apps/web/.env\` to get an explanation of why a
submission failed its testcase, without being handed the fix.`,
};

function stubCompletion(feature: AiFeature): {
  stream: ReadableStream<Uint8Array>;
  result: Promise<AiResult>;
} {
  const text = STUBS[feature];
  const encoder = new TextEncoder();

  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    result: Promise.resolve({
      text,
      model: "offline-stub",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      latencyMs: 0,
      stubbed: true,
    }),
  };
}

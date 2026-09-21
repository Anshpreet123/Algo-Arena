"use client";

import { useCallback, useRef, useState } from "react";

export interface AiStreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
  /** True when the server replayed a stored answer instead of generating one. */
  fromCache: boolean;
}

/**
 * Consumes a text/plain streaming response and exposes the text as it lands.
 *
 * The AI routes stream raw markdown rather than SSE: there is exactly one
 * message per request and no event types to multiplex, so SSE framing would
 * be overhead with nothing to carry.
 */
export function useAiStream() {
  const [state, setState] = useState<AiStreamState>({
    text: "",
    isStreaming: false,
    error: null,
    fromCache: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (url: string, body: unknown) => {
    // A second click supersedes the first rather than racing it.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ text: "", isStreaming: true, error: null, fromCache: false });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await safeMessage(response);
        setState({ text: "", isStreaming: false, error: message, fromCache: false });
        return;
      }

      const fromCache = response.headers.get("x-arena-cached") === "1";
      const reader = response.body?.getReader();
      if (!reader) {
        setState({ text: "", isStreaming: false, error: "Empty response", fromCache });
        return;
      }

      const decoder = new TextDecoder();
      let text = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setState({ text, isStreaming: true, error: null, fromCache });
      }

      setState({ text, isStreaming: false, error: null, fromCache });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({
        text: "",
        isStreaming: false,
        error: (err as Error).message,
        fromCache: false,
      });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ text: "", isStreaming: false, error: null, fromCache: false });
  }, []);

  const setText = useCallback((text: string) => {
    setState({ text, isStreaming: false, error: null, fromCache: true });
  }, []);

  return { ...state, run, reset, setText };
}

async function safeMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

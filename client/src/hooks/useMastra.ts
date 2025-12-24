import { useState, useCallback, useRef } from "react";
import { MastraClient } from "@mastra/client-js";
import type { ChunkType } from "@mastra/core/stream";

const BASE_URL = import.meta.env.VITE_MASTRA_API_URL || "http://localhost:4111";

// Discriminated union: each item type has a unique `type` field.
export type ChatMessage =
  | { type: "user-message"; id: string; content: string }
  | {
      type: "tool-call";
      runId: string;
      toolCallId: string;
      toolName: string;
      argsText: string;
      args?: Record<string, unknown>;
      result?: unknown;
      status: "streaming" | "executing" | "done";
    }
  | { type: "assistant-text"; runId: string; content: string };

export function useMastra(agentName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleChunk = useCallback(async (c: ChunkType) => {
    // Text delta: append to existing assistant-text item, or create one.
    if (c.type === "text-delta") {
      const text = c.payload.text as string;
      setMessages((prev) => {
        const existing = prev.find(
          (msg) => msg.type === "assistant-text" && msg.runId === c.runId,
        );
        if (existing) {
          return prev.map((msg) =>
            msg.type === "assistant-text" && msg.runId === c.runId
              ? { ...msg, content: msg.content + text }
              : msg,
          );
        } else {
          return [
            ...prev,
            { type: "assistant-text", runId: c.runId, content: text },
          ];
        }
      });
    }

    // Tool call starts: create a new tool-call item.
    if (c.type === "tool-call-input-streaming-start") {
      const newToolCall: ChatMessage = {
        type: "tool-call",
        runId: c.runId,
        toolCallId: c.payload.toolCallId as string,
        toolName: (c.payload.toolName as string) || "unknown",
        argsText: "",
        status: "streaming",
      };
      setMessages((prev) => [...prev, newToolCall]);
    }

    // Args streaming: append delta to the tool-call's argsText.
    if (c.type === "tool-call-delta") {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "tool-call" && msg.toolCallId === c.payload.toolCallId
            ? {
                ...msg,
                argsText:
                  msg.argsText + ((c.payload.argsTextDelta as string) || ""),
              }
            : msg,
        ),
      );
    }

    // Args complete: we now have parsed args object, tool is executing.
    if (c.type === "tool-call" && c.payload.toolCallId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "tool-call" && msg.toolCallId === c.payload.toolCallId
            ? {
                ...msg,
                args: c.payload.args as Record<string, unknown>,
                status: "executing" as const,
              }
            : msg,
        ),
      );
    }

    // Tool result: execution finished, attach the result.
    if (c.type === "tool-result") {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "tool-call" && msg.toolCallId === c.payload.toolCallId
            ? { ...msg, result: c.payload.result, status: "done" as const }
            : msg,
        ),
      );
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: ChatMessage = {
        type: "user-message",
        id: crypto.randomUUID(),
        content,
      };
      setMessages((prev) => [...prev, userMessage]);

      setIsStreaming(true);
      abortControllerRef.current = new AbortController();

      try {
        const client = new MastraClient({
          baseUrl: BASE_URL,
          abortSignal: abortControllerRef.current.signal,
        });
        const agent = client.getAgent(agentName);
        const stream = await agent.stream(content, {
          memory: {
            thread: "1",
            resource: "booker",
          },
        });
        await stream.processDataStream({ onChunk: handleChunk });
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
    },
    [agentName, isStreaming, handleChunk],
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    abort,
  };
}

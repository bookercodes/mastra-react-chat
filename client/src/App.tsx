import "./App.css";
import { mastraClient } from "./lib/mastra";
import { useState } from "react";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "./components/ai-elements/tool";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./components/ai-elements/message";

// Discriminated union: each item type has a unique `type` field.
// This lets TypeScript narrow the type when you check item.type.
type ChatItem =
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

function ChatApp() {
  // Single array holds all chat items in chronological order.
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("what is the weather in London?");
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatItem = {
      type: "user-message",
      id: crypto.randomUUID(),
      content: input,
    };

    setItems((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const agent = mastraClient.getAgent("weather-agent");
    const stream = await agent.stream(input);

    await stream.processDataStream({
      onChunk: async (c) => {
        // Text delta: append to existing assistant-text item, or create one.
        // The runId ties all chunks from one agent response together.
        if (c.type === "text-delta") {
          const text = c.payload.text;
          setItems((prev) => {
            const existing = prev.find(
              (item) => item.type === "assistant-text" && item.runId === c.runId,
            );
            if (existing) {
              // Append to existing assistant-text item
              return prev.map((item) =>
                item.type === "assistant-text" && item.runId === c.runId
                  ? { ...item, content: item.content + text }
                  : item,
              );
            } else {
              // First text chunk for this run: create new assistant-text item
              return [...prev, { type: "assistant-text", runId: c.runId, content: text }];
            }
          });
        }

        // Tool call starts: create a new tool-call item.
        // This fires before any args stream in, so we initialize with empty argsText.
        if (c.type === "tool-call-input-streaming-start") {
          const newToolCall: ChatItem = {
            type: "tool-call",
            runId: c.runId,
            toolCallId: c.payload.toolCallId,
            toolName: c.payload.toolName || "unknown",
            argsText: "",
            status: "streaming",
          };
          setItems((prev) => [...prev, newToolCall]);
        }

        // Args streaming: append delta to the tool-call's argsText.
        // argsText accumulates the raw JSON string as it streams in.
        if (c.type === "tool-call-delta") {
          setItems((prev) =>
            prev.map((item) =>
              item.type === "tool-call" && item.toolCallId === c.payload.toolCallId
                ? { ...item, argsText: item.argsText + (c.payload.argsTextDelta || "") }
                : item,
            ),
          );
        }

        // Args complete: we now have parsed args object, tool is executing.
        // This replaces the streamed argsText with the actual parsed args.
        if (c.type === "tool-call" && c.payload.toolCallId) {
          setItems((prev) =>
            prev.map((item) =>
              item.type === "tool-call" && item.toolCallId === c.payload.toolCallId
                ? { ...item, args: c.payload.args, status: "executing" as const }
                : item,
            ),
          );
        }

        // Tool result: execution finished, attach the result.
        if (c.type === "tool-result") {
          setItems((prev) =>
            prev.map((item) =>
              item.type === "tool-call" && item.toolCallId === c.payload.toolCallId
                ? { ...item, result: c.payload.result, status: "done" as const }
                : item,
            ),
          );
        }
      },
    });

    setIsStreaming(false);
  };

  return (
    <div>
      <div>
        {/* Single loop: items render in the order they were added to the array.
            No need to reconcile separate state or handle "pending" items. */}
        {items.map((item) => {
          if (item.type === "user-message") {
            return (
              <Message key={item.id} from="user">
                <MessageContent>{item.content}</MessageContent>
              </Message>
            );
          }

          if (item.type === "tool-call") {
            // Map our status to ToolUIPart state expected by the Tool component
            const stateMap = {
              streaming: "input-streaming",
              executing: "input-available",
              done: "output-available",
            } as const;

            return (
              <Tool key={item.toolCallId}>
                <ToolHeader type={`tool-${item.toolName}`} state={stateMap[item.status]} />
                <ToolContent>
                  {/* Show parsed args if available, otherwise show raw streaming text */}
                  <ToolInput input={item.args ?? item.argsText} />
                  {item.result !== undefined && (
                    <ToolOutput output={item.result} errorText={undefined} />
                  )}
                </ToolContent>
              </Tool>
            );
          }

          if (item.type === "assistant-text") {
            return (
              <Message key={item.runId} from="assistant">
                <MessageContent>
                  <MessageResponse>{item.content}</MessageResponse>
                </MessageContent>
              </Message>
            );
          }

          return null;
        })}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatApp;

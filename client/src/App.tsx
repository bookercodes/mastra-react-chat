import "./App.css";
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
import { useMastra } from "./hooks/useMastra";

function ChatApp() {
  const { messages, isStreaming, sendMessage } = useMastra("weather-agent");
  const [input, setInput] = useState("what is the weather in London?");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  return (
    <div>
      <div>
        {messages.map((msg) => {
          if (msg.type === "user-message") {
            return (
              <Message key={msg.id} from="user">
                <MessageContent>{msg.content}</MessageContent>
              </Message>
            );
          }

          if (msg.type === "tool-call") {
            const stateMap = {
              streaming: "input-streaming",
              executing: "input-available",
              done: "output-available",
            } as const;

            return (
              <Tool key={msg.toolCallId}>
                <ToolHeader
                  type={`tool-${msg.toolName}`}
                  state={stateMap[msg.status]}
                />
                <ToolContent>
                  <ToolInput input={msg.args ?? msg.argsText} />
                  {msg.result !== undefined && (
                    <ToolOutput output={msg.result} errorText={undefined} />
                  )}
                </ToolContent>
              </Tool>
            );
          }

          if (msg.type === "assistant-text") {
            return (
              <Message key={msg.runId} from="assistant">
                <MessageContent>
                  <MessageResponse>{msg.content}</MessageResponse>
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

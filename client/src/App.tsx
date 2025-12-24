import "./App.css";
import type { PromptInputMessage } from "./components/ai-elements/prompt-input";
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
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "./components/ai-elements/prompt-input";
import { useMastra } from "./hooks/useMastra";

function ChatApp() {
  const { messages, isStreaming, sendMessage, abort } = useMastra("weather-agent");

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    if (!text.trim() || isStreaming) return;
    await sendMessage(text);
  };

  return (
    <div className="flex flex-col h-screen">
      <Conversation>
        <ConversationContent>
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
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-4 border-t">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            className="min-h-0 py-2"
            placeholder="Type a message..."
          />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit
              status={isStreaming ? "streaming" : "ready"}
              onStop={abort}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export default ChatApp;

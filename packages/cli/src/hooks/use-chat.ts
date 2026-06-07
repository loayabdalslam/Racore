import { useCallback, useMemo, useState } from "react";
import { submitChat } from "../lib/chat-service";
import {
  type ChatMessage as Message,
  type ModeType,
  ProviderId,
  type ProviderIdType,
} from "../lib/app-schema";
import { appendMessages } from "../lib/session-store";

export type { Message };

export function useChat(sessionId: string, initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [error, setError] = useState<Error | null>(null);

  const submit = useCallback(async (params: {
    userText: string;
    mode: ModeType;
    model: string;
    provider: ProviderIdType;
  }) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: params.userText }],
      metadata: {
        mode: params.mode,
        provider: ProviderId.OPENROUTER,
        model: params.model,
      },
    };

    const pendingMessages = [...messages, userMessage];
    setMessages(pendingMessages);
    setStatus("streaming");
    setError(null);

    try {
      let streamingAssistantId: string | null = null;
      const assistantMessage = await submitChat({
        messages: pendingMessages,
        mode: params.mode,
        model: params.model,
        onUpdate: (partialMessage) => {
          streamingAssistantId = partialMessage.id;
          setMessages((currentMessages) => {
            const existingIndex = currentMessages.findIndex((message) => message.id === partialMessage.id);
            if (existingIndex === -1) {
              return [...pendingMessages, partialMessage];
            }

            const nextMessages = [...currentMessages];
            nextMessages[existingIndex] = partialMessage;
            return nextMessages;
          });
        },
      });

      const nextMessages = streamingAssistantId
        ? [...pendingMessages, { ...assistantMessage, id: streamingAssistantId }]
        : [...pendingMessages, assistantMessage];
      setMessages(nextMessages);
      appendMessages(sessionId, nextMessages);
      setStatus("ready");
    } catch (submitError) {
      const resolved = submitError instanceof Error ? submitError : new Error(String(submitError));
      setError(resolved);
      setStatus("error");
    }
  }, [messages, sessionId]);

  const abort = useCallback(async () => {
    setStatus("ready");
  }, []);

  return useMemo(() => ({
    messages,
    status,
    error,
    submit,
    abort,
    interrupt: abort,
  }), [abort, error, messages, status, submit]);
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { useKeyboard } from "@opentui/react";
import { SessionShell } from "../components/session-shell";
import { UserMessage, BotMessage, ErrorMessage } from "../components/messages";
import { useToast } from "../providers/toast";
import { useChat } from "../hooks/use-chat";
import { usePromptConfig } from "../providers/prompt-config";
import type { Message } from "../hooks/use-chat";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { type ModeType, type SessionRecord } from "../lib/app-schema";
import { getSession } from "../lib/session-store";

const sessionLocationSchema = z.object({
  session: z.custom<SessionRecord>((val) => val != null && typeof val === "object" && "id" in val),
  initialPrompt: z.object({
    message: z.string(),
    mode: z.custom<ModeType>(),
    model: z.string(),
  }).optional(),
});

function ChatMessage({ msg, streaming = false }: { msg: Message; streaming?: boolean }) {
  if (msg.role === "user") {
    const text = msg.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");

    return <UserMessage message={text} mode={msg.metadata?.mode ?? "BUILD"} />;
  }

  return (
    <BotMessage
      parts={msg.parts}
      model={msg.metadata?.model ?? "unknown"}
      mode={msg.metadata?.mode ?? "BUILD"}
      durationMs={msg.metadata?.durationMs}
      streaming={streaming}
    />
  );
}

function SessionChat({
  session,
  initialPrompt,
}: {
  session: SessionRecord;
  initialPrompt?: { message: string; mode: ModeType; model: string };
}) {
  const [initialMessages] = useState(() => session.messages as Message[]);
  const { mode, model, provider } = usePromptConfig();
  const { isTopLayer } = useKeyboardLayer();
  const { messages, status, submit, abort, interrupt, error } = useChat(session.id, initialMessages);
  const hasSubmittedInitialPromptRef = useRef(false);

  useEffect(() => () => { void abort(); }, [abort]);

  useKeyboard((key) => {
    if (key.name === "escape" && isTopLayer("base") && status === "streaming") {
      key.preventDefault();
      void interrupt();
    }
  });

  useEffect(() => {
    if (!initialPrompt || hasSubmittedInitialPromptRef.current) return;
    hasSubmittedInitialPromptRef.current = true;
    void submit({
      userText: initialPrompt.message,
      mode: initialPrompt.mode,
      model: initialPrompt.model,
      provider,
    });
  }, [initialPrompt, provider, submit]);

  return (
    <SessionShell
      onSubmit={(text) => submit({ userText: text, mode, model, provider })}
      loading={status === "submitted" || status === "streaming"}
      interruptible={status === "submitted" || status === "streaming"}
    >
      {messages.map((msg, index) => (
        <ChatMessage
          key={msg.id}
          msg={msg}
          streaming={status === "streaming" && index === messages.length - 1 && msg.role === "assistant"}
        />
      ))}
      {error ? <ErrorMessage message={error.message} /> : null}
    </SessionShell>
  );
}

export function Session() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const prefetched = useMemo(() => {
    const parsed = sessionLocationSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  const [session, setSession] = useState<SessionRecord | null>(prefetched?.session ?? null);

  useEffect(() => {
    if (prefetched?.session) return;
    if (!id) return;

    const resolved = getSession(id);
    if (!resolved) {
      toast.show({ variant: "error", message: "Session not found" });
      navigate("/", { replace: true });
      return;
    }
    setSession(resolved);
  }, [id, navigate, prefetched, toast]);

  if (!session) {
    return <SessionShell onSubmit={() => {}} inputDisabled loading />;
  }

  return <SessionChat key={session.id} session={session} initialPrompt={prefetched?.initialPrompt} />;
}

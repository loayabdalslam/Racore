import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { InputBar } from "../components/input-bar";
import { BotMessage, ErrorMessage, UserMessage } from "../components/messages";
import { TodoPanel } from "../components/todo-panel";
import { FileActivityPanel } from "../components/file-activity-panel";
import { Spinner } from "../components/spinner";
import { useChat, type Message } from "../hooks/use-chat";
import { type ModeType, type SessionRecord } from "../lib/app-schema";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { createSession, listSessions } from "../lib/session-store";
import { addTodo } from "../lib/todo-store";
import { decomposeTask } from "../lib/task-planner";
import { executeAllTasks } from "../lib/task-executor";

function shortTitle(title: string) {
  return title.length > 24 ? `${title.slice(0, 21)}...` : title;
}

function ChatMessage({ msg, displayModel }: { msg: Message; displayModel: string }) {
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
      model={displayModel}
      mode={msg.metadata?.mode ?? "BUILD"}
      durationMs={msg.metadata?.durationMs}
      streaming={false}
    />
  );
}

function InlineChat({
  session,
  initialPrompt,
  onSubmit,
}: {
  session: SessionRecord;
  initialPrompt: { message: string; mode: ModeType; model: string } | null;
  onSubmit: (handler: (text: string) => void) => void;
}) {
  const { mode, model, provider } = usePromptConfig();
  const { messages, status, submit, error } = useChat(session.id, session.messages as Message[]);
  const submittedRef = useRef(false);

  useEffect(() => {
    onSubmit((text) => {
      void submit({ userText: text, mode, model, provider });
    });
  }, [mode, model, onSubmit, provider, submit]);

  useEffect(() => {
    if (!initialPrompt || submittedRef.current) return;
    submittedRef.current = true;
    void submit({
      userText: initialPrompt.message,
      mode: initialPrompt.mode,
      model: initialPrompt.model,
      provider,
    });
  }, [initialPrompt, provider, submit]);

  return (
    <box flexDirection="column" flexGrow={1} width="100%" gap={1}>
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box flexDirection="column" gap={1} width="100%">
          {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} displayModel={model} />)}
          {status === "streaming" || status === "submitted" ? (
            <box paddingX={2}>
              <Spinner mode={mode} />
            </box>
          ) : null}
          {error ? <ErrorMessage message={error.message} /> : null}
        </box>
      </scrollbox>
    </box>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const { isTopLayer } = useKeyboardLayer();
  const { mode, model, provider } = usePromptConfig();
  const [sessionVersion, setSessionVersion] = useState(0);
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<{ message: string; mode: ModeType; model: string } | null>(null);
  const [focusArea, setFocusArea] = useState<"chat" | "sidebar">("chat");
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const submitHandlerRef = useRef<((text: string) => void) | null>(null);
  const sessions = useMemo(() => listSessions().slice(0, 12), [sessionVersion]);
  const sidebarItemCount = 1 + sessions.length;

  const handleSubmit = useCallback(
    async (text: string) => {
      addTodo(text.length > 80 ? text.slice(0, 77) + "..." : text);

      if (text.length > 150) {
        try {
          const subTasks = await decomposeTask(text);
          const subTaskIds: string[] = [];
          for (const task of subTasks) {
            const item = addTodo(task.title);
            subTaskIds.push(item.id);
          }
          executeAllTasks({ model, taskIds: subTaskIds }).catch(() => {});
        } catch {
          // decomposition is optional; continue normally
        }
      }

      if (activeSession && submitHandlerRef.current) {
        submitHandlerRef.current(text);
        setSessionVersion((version) => version + 1);
        return;
      }

      const session = createSession(text.slice(0, 100) || "New chat");
      setActiveSession(session);
      setInitialPrompt({ message: text, mode, model });
      setSessionVersion((version) => version + 1);
    },
    [activeSession, mode, model],
  );

  const setInlineSubmitHandler = useCallback((handler: (text: string) => void) => {
    submitHandlerRef.current = handler;
  }, []);

  const openSidebarItem = useCallback((index: number) => {
    if (index === 0) {
      setActiveSession(null);
      setInitialPrompt(null);
      submitHandlerRef.current = null;
      setFocusArea("chat");
      return;
    }

    const session = sessions[index - 1];
    if (!session) return;

    setActiveSession(session);
    setInitialPrompt(null);
    setFocusArea("chat");
  }, [sessions]);

  useKeyboard((key) => {
    if (!isTopLayer("base")) return;

    if (key.name === "left") {
      key.preventDefault();
      setFocusArea("sidebar");
      return;
    }

    if (key.name === "right") {
      key.preventDefault();
      setFocusArea("chat");
      return;
    }

    if (focusArea !== "sidebar") return;

    if (key.name === "up") {
      key.preventDefault();
      setSidebarIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.name === "down") {
      key.preventDefault();
      setSidebarIndex((current) => Math.min(Math.max(0, sidebarItemCount - 1), current + 1));
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      openSidebarItem(sidebarIndex);
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexGrow={1}
      flexDirection="row"
      backgroundColor={colors.background}
      overflow="hidden"
    >
      <box
        width={30}
        height="100%"
        flexShrink={0}
        flexDirection="column"
        backgroundColor={colors.dialogSurface}
        paddingX={2}
        paddingY={1}
        gap={1}
        border={["right"]}
        borderColor={colors.dimSeparator}
      >
        <box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
          <text attributes={TextAttributes.BOLD}>racore</text>
          <text color={colors.accent}>[new]</text>
        </box>

        <box
          onClick={() => {
            setActiveSession(null);
            setInitialPrompt(null);
            submitHandlerRef.current = null;
            setSidebarIndex(0);
          }}
          width="100%"
          backgroundColor={focusArea === "sidebar" && sidebarIndex === 0 ? colors.selection : colors.surface}
          paddingX={1}
          paddingY={1}
        >
          <text color={focusArea === "sidebar" && sidebarIndex === 0 ? colors.selectionText : "white"}>New chat</text>
        </box>

        <text attributes={TextAttributes.DIM}>Sessions</text>
        <scrollbox flexGrow={1} width="100%">
          <box flexDirection="column" gap={1} width="100%">
            {sessions.length === 0 ? (
              <box paddingX={1}>
                <text attributes={TextAttributes.DIM}>No saved chats yet</text>
              </box>
            ) : null}

            {sessions.map((session, index) => {
              const itemIndex = index + 1;
              const isSelected = focusArea === "sidebar" && sidebarIndex === itemIndex;
              const isActive = activeSession?.id === session.id;

              return (
              <box
                key={session.id}
                onClick={() => {
                  setActiveSession(session);
                  setInitialPrompt(null);
                  setSidebarIndex(itemIndex);
                }}
                width="100%"
                overflow="hidden"
                paddingX={1}
                paddingY={1}
                backgroundColor={isSelected ? colors.selection : isActive ? colors.dialogSurface : colors.surface}
              >
                <text color={isSelected ? colors.selectionText : "white"}>{shortTitle(session.title)}</text>
              </box>
              );
            })}
          </box>
        </scrollbox>

        <box flexDirection="column" gap={1}>
          <text color={colors.accent} onClick={() => navigate("/config")}>[/config]</text>
          <text color={colors.accent} onClick={() => navigate("/releases")}>[/releases]</text>
        </box>
      </box>

      <box
        flexGrow={1}
        height="100%"
        flexDirection="column"
        alignItems="center"
        overflow="hidden"
        paddingX={4}
        paddingY={2}
      >
        <box flexGrow={1} width="100%" maxWidth={78} flexDirection="column" minHeight={0} overflow="hidden">
          {activeSession ? (
            <InlineChat
              key={activeSession.id}
              session={activeSession}
              initialPrompt={initialPrompt}
              onSubmit={setInlineSubmitHandler}
            />
          ) : (
            <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} gap={1}>
              <ascii-font font="tiny" text="R'a Core" />
              <text attributes={TextAttributes.DIM}>Your standalone coding agent</text>
              <box flexDirection="row" gap={1} marginTop={1}>
                <text color={colors.modeBuild}>{mode === "BUILD" ? "Normal" : mode === "ULTRA" ? "Ultra" : "Plan"}</text>
                <text attributes={TextAttributes.DIM}>›</text>
                <text>{provider}</text>
                <text attributes={TextAttributes.DIM}>›</text>
                <text>{model}</text>
              </box>
            </box>
          )}
        </box>

        <box width="100%" maxWidth={78} flexDirection="column" gap={1} flexShrink={0}>
          <InputBar onSubmit={handleSubmit} active={focusArea === "chat"} />
          <box flexDirection="row" justifyContent="space-between" width="100%" paddingX={1}>
            <box flexDirection="row" gap={2}>
              <text color={colors.accent} onClick={() => navigate("/config")}>/config</text>
              <text color={colors.accent}>/sessions</text>
              <text color={colors.accent} onClick={() => navigate("/releases")}>/releases</text>
            </box>
            <box flexDirection="row" gap={1}>
              <text>{focusArea === "sidebar" ? "right" : "left"}</text>
              <text attributes={TextAttributes.DIM}>{focusArea === "sidebar" ? "chat" : "sessions"}</text>
              <text attributes={TextAttributes.DIM}> | </text>
              <text>tab</text>
              <text attributes={TextAttributes.DIM}>mode</text>
            </box>
          </box>
        </box>
      </box>

      {activeSession ? <TodoPanel /> : null}
      {activeSession ? <FileActivityPanel /> : null}
    </box>
  );
};

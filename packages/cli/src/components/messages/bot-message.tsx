import prettyMs from "pretty-ms";
import { TextAttributes } from "@opentui/core";
import type { Message } from "../../hooks/use-chat";
import { Mode, type ModeType } from "../../lib/app-schema";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";
import { MarkdownText } from "./markdown-text";

type ClientMessagePart = Message["parts"][number];
type ToolPart = Extract<ClientMessagePart, { type: `tool-${string}` }>;

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  streaming?: boolean;
};

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isToolPart(part: ClientMessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

function formatToolArgs(toolPart: ToolPart): string {
  if (toolPart.input == null || typeof toolPart.input !== "object") {
    return "";
  }
  return Object.values(toolPart.input).map(String).join(" ");
}

type PartGroup = {
  type: ClientMessagePart["type"];
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      const key = isToolPart(part) ? `group-tc-${part.toolCallId}` : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }

  return groups;
}

export function BotMessage({ parts, model, mode, durationMs, streaming = false }: Props) {
  const { colors } = useTheme();
  const modeLabel = mode === Mode.PLAN ? "Plan" : mode === Mode.ULTRA ? "Ultra" : "Build";
  const modeColor = mode === Mode.PLAN ? colors.planMode : mode === Mode.ULTRA ? colors.info : colors.primary;

  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group, i) => (
        <box key={group.key} width="100%" paddingTop={i === 0 ? 0 : 1}>
          {group.parts.map((part, j) => {
            if (part.type === "reasoning") {
              return (
                <box
                  key={`reasoning-${j}`}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.thinking}>Thinking:</em> {part.text}
                  </text>
                </box>
              );
            }

            if (isToolPart(part)) {
              const toolName = part.type.slice("tool-".length);

              return (
                <box
                  key={part.toolCallId}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.info}>{formatToolName(toolName)}:</em> {formatToolArgs(part)}
                    {part.state === "output-error" ? ` ${part.errorText}` : ""}
                  </text>
                </box>
              );
            }

            if (part.type === "text") {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <MarkdownText text={part.text} />
                </box>
              );
            }

            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingY={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={modeColor}>◉</text>
          <box flexDirection="row" gap={1}>
            <text>{modeLabel}</text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>›</text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {streaming ? <text attributes={TextAttributes.DIM}>streaming</text> : null}
            {durationMs != null ? (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>›</text>
                <text attributes={TextAttributes.DIM}>{prettyMs(durationMs)}</text>
              </>
            ) : null}
          </box>
        </box>
      </box>
    </box>
  );
}

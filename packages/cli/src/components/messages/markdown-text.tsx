import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";

type MarkdownSegment = {
  type: "text" | "bold" | "italic" | "inlineCode" | "codeBlock" | "header" | "listItem" | "hr" | "newline";
  text: string;
  language?: string;
};

function parseMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = text.split("\n");
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        segments.push({ type: "codeBlock", text: codeBlockLines.join("\n"), language: codeBlockLang });
        codeBlockLines = [];
        codeBlockLang = "";
        inCodeBlock = false;
        continue;
      }
      inCodeBlock = true;
      codeBlockLang = line.slice(3).trim();
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim() === "" && segments.length > 0) {
      segments.push({ type: "newline", text: "" });
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      segments.push({ type: "header", text: line.replace(/^#+\s*/, "") });
      continue;
    }

    if (/^(\*|-|\d+[.)])\s/.test(line)) {
      segments.push({ type: "listItem", text: line.replace(/^(\*|-|\d+[.)])\s*/, "") });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      segments.push({ type: "hr", text: "" });
      continue;
    }

    let remaining = line;
    const inlineSegments: MarkdownSegment[] = [];
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`.+?`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        inlineSegments.push({ type: "text", text: remaining.slice(lastIndex, match.index) });
      }
      if (match[1]) {
        inlineSegments.push({ type: "bold", text: match[2]! });
      } else if (match[3]) {
        inlineSegments.push({ type: "italic", text: match[4]! });
      } else if (match[0].startsWith("`")) {
        inlineSegments.push({ type: "inlineCode", text: match[0].slice(1, -1) });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < remaining.length) {
      inlineSegments.push({ type: "text", text: remaining.slice(lastIndex) });
    }

    if (inlineSegments.length === 0) {
      inlineSegments.push({ type: "text", text: remaining });
    }

    segments.push(...inlineSegments);
    segments.push({ type: "newline", text: "" });
  }

  return segments;
}

function renderSegment(segment: MarkdownSegment, colors: Record<string, string>, index: number) {
  switch (segment.type) {
    case "header":
      return (
        <text key={`seg-${index}`} attributes={TextAttributes.BOLD}>
          {segment.text}
        </text>
      );
    case "bold":
      return (
        <text key={`seg-${index}`} attributes={TextAttributes.BOLD}>
          {segment.text}
        </text>
      );
    case "italic":
      return (
        <em key={`seg-${index}`}>{segment.text}</em>
      );
    case "inlineCode":
      return (
        <text key={`seg-${index}`} fg={colors.primary}>
          {segment.text}
        </text>
      );
    case "codeBlock":
      return (
        <box key={`seg-${index}`} border={["left"]} borderColor={colors.dimSeparator} paddingX={2} width="100%">
          <text fg={colors.info} attributes={TextAttributes.DIM}>
            {segment.text}
          </text>
        </box>
      );
    case "listItem":
      return (
        <box key={`seg-${index}`} flexDirection="row" gap={1} paddingLeft={1}>
          <text>•</text>
          <text>{segment.text}</text>
        </box>
      );
    case "hr":
      return (
        <text key={`seg-${index}`} fg={colors.dimSeparator}>
          {"\u2500".repeat(40)}
        </text>
      );
    case "newline":
      return <text key={`seg-${index}`}>{" "}</text>;
    default:
      return <text key={`seg-${index}`}>{segment.text}</text>;
  }
}

type Props = {
  text: string;
};

export function MarkdownText({ text }: Props) {
  const { colors } = useTheme();
  const segments = parseMarkdown(text);

  return (
    <box flexDirection="column" gap={0} width="100%">
      {segments.map((seg, i) => renderSegment(seg, colors, i))}
    </box>
  );
}

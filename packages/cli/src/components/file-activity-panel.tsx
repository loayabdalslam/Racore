import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { subscribe, type FileActivity } from "../lib/file-activity-store";
import { RTLText } from "./rtl-text";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function FileActivityPanel() {
  const { colors } = useTheme();
  const [activities, setActivities] = useState<FileActivity[]>([]);
  const [frame, setFrame] = useState(0);

  useEffect(() => subscribe(setActivities), []);

  useEffect(() => {
    const hasProgress = activities.some((a) => a.status === "in_progress");
    if (!hasProgress) return;
    const interval = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 150);
    return () => clearInterval(interval);
  }, [activities]);

  const adds = activities.filter((a) => a.status === "completed" && a.diff).reduce((s, a) => s + a.diff!.filter((d) => d.type === "add").length, 0);
  const dels = activities.filter((a) => a.status === "completed" && a.diff).reduce((s, a) => s + a.diff!.filter((d) => d.type === "del").length, 0);

  return (
    <box
      width={30}
      height="100%"
      flexShrink={0}
      flexDirection="column"
      backgroundColor={colors.dialogSurface}
      paddingX={1}
      paddingY={1}
      gap={1}
      border={["left"]}
      borderColor={colors.dimSeparator}
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <RTLText attributes={TextAttributes.BOLD}>Files</RTLText>
        <RTLText attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          +{adds} -{dels}
        </RTLText>
      </box>
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box flexDirection="column" gap={1} width="100%">
          {activities.length === 0 ? (
            <box paddingX={1}>
              <RTLText attributes={TextAttributes.DIM}>No file activity</RTLText>
            </box>
          ) : null}

          {[...activities].reverse().slice(0, 50).map((act) => (
            <box
              key={act.id}
              width="100%"
              overflow="hidden"
              paddingX={1}
              paddingY={0}
              flexDirection="column"
            >
              <box flexDirection="row" gap={1} width="100%" overflow="hidden">
                <RTLText
                  fg={
                    act.status === "error" ? colors.error :
                    act.status === "completed" ? colors.success :
                    act.status === "in_progress" ? colors.info :
                    colors.dimSeparator
                  }
                >
                  {act.status === "in_progress"
                    ? SPINNER_FRAMES[frame % SPINNER_FRAMES.length]
                    : act.status === "completed" ? "✓" : act.status === "error" ? "✗" : "·"}
                </RTLText>
                <RTLText attributes={TextAttributes.DIM} fg={colors.primary}>
                  {act.action === "write" ? "+" : act.action === "edit" ? "~" : act.action === "patch" ? "Δ" : "−"}
                </RTLText>
                <RTLText attributes={TextAttributes.DIM} wrap="ellipsis" overflow="hidden">
                  {act.filePath.length > 24 ? "…" + act.filePath.slice(-21) : act.filePath}
                </RTLText>
              </box>

              {act.status === "in_progress" && (!act.diff || act.diff.length === 0) ? (
                <box paddingLeft={3}>
                  <RTLText attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                    running...
                  </RTLText>
                </box>
              ) : null}

              {act.diff && act.diff.length > 0 ? (
                <box flexDirection="column" paddingLeft={3} gap={0}>
                  {act.diff.slice(0, 10).map((line, i) => (
                    <RTLText
                      key={i}
                      fg={line.type === "add" ? colors.success : line.type === "del" ? colors.error : colors.dimSeparator}
                      attributes={TextAttributes.DIM}
                      wrap="ellipsis"
                      overflow="hidden"
                    >
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : " "} {line.text.slice(0, 25)}
                    </RTLText>
                  ))}
                  {act.diff.length > 10 ? (
                    <RTLText attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                      … {act.diff.length - 10} more lines
                    </RTLText>
                  ) : null}
                </box>
              ) : null}

              {act.error ? (
                <box paddingLeft={3}>
                  <RTLText fg={colors.error} attributes={TextAttributes.DIM}>{act.error}</RTLText>
                </box>
              ) : null}
            </box>
          ))}
        </box>
      </scrollbox>
    </box>
  );
}

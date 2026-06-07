import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { InputBar } from "./input-bar";
import { Spinner } from "./spinner";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";

type Props = {
  children?: ReactNode;
  onSubmit: (text: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
  interruptible?: boolean;
};

export function SessionShell({
  children,
  onSubmit,
  inputDisabled = false,
  loading = false,
  interruptible = false,
}: Props) {
  const { mode } = usePromptConfig();
  const { colors } = useTheme();

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width="100%"
      height="100%"
      overflow="hidden"
    >
      <scrollbox flexGrow={1} width="100%" paddingX={2} paddingTop={1} stickyScroll stickyStart="bottom">
        <box flexDirection="column" gap={1}>
          {children}
        </box>
      </scrollbox>
      <box flexDirection="column" paddingX={2} paddingTop={1} gap={1} flexShrink={0} border={["top"]} borderColor={colors.dimSeparator}>
        <box flexDirection="row" alignItems="center" gap={2} flexShrink={0}>
          {loading ? (
            <>
              <Spinner mode={mode} />
              {interruptible ? <text>esc to interrupt</text> : null}
            </>
          ) : null}
        </box>
        <InputBar onSubmit={onSubmit} disabled={inputDisabled} />
        <box flexDirection="row" gap={1} flexShrink={0} justifyContent="flex-end">
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>mode</text>
        </box>
      </box>
    </box>
  );
};
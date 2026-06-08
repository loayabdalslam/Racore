import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { Header } from "./header";
import { useTheme } from "../providers/theme";

type Action = {
  label: string;
  onSelect: () => void;
  tone?: "primary" | "info" | "muted";
};

type CenteredPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: Action[];
  footerHint?: string;
};

function ActionLink({ action }: { action: Action }) {
  const { colors } = useTheme();
  const color =
    action.tone === "primary"
      ? colors.primary
      : action.tone === "muted"
        ? colors.dimSeparator
        : colors.info;

  return <text fg={color} onMouseDown={action.onSelect}>[{action.label}]</text>;
}

export function CenteredPage({
  title,
  description,
  children,
  actions = [],
  footerHint = "tab mode",
}: CenteredPageProps) {
  const { colors, fontSize } = useTheme();
  const pageMaxWidth = fontSize === "Small" ? 88 : fontSize === "Large" ? 70 : 78;
  const panelMaxWidth = fontSize === "Small" ? 82 : fontSize === "Large" ? 66 : 74;
  const panelPaddingX = fontSize === "Large" ? 2 : 3;

  return (
    <box alignItems="center" justifyContent="center" flexGrow={1} width="100%" height="100%" paddingX={2} paddingY={1}>
      <box width="100%" maxWidth={pageMaxWidth} flexDirection="column" gap={1} alignItems="center">
        <Header />
        <box
          width="100%"
          maxWidth={panelMaxWidth}
          backgroundColor={colors.surface}
          border={["left", "right"]}
          borderColor={colors.dimSeparator}
          paddingX={panelPaddingX}
          paddingY={2}
          flexDirection="column"
          gap={1}
        >
          <box alignItems="center" justifyContent="center">
            <text attributes={TextAttributes.BOLD}>{title.toUpperCase()}</text>
          </box>
          {description ? (
            <box width="100%" justifyContent="center" paddingX={2}>
              <text width="100%" fg={colors.dimSeparator} wrapMode="word" textAlign="center">{description}</text>
            </box>
          ) : null}
          <box width="100%" flexDirection="column" gap={2}>
            {children}
          </box>
          {actions.length > 0 ? (
            <box width="100%" justifyContent="center" paddingTop={1}>
              <box flexDirection="row" gap={2} justifyContent="center">
                {actions.map((action) => <ActionLink key={action.label} action={action} />)}
              </box>
            </box>
          ) : null}
        </box>
        <box width="100%" maxWidth={panelMaxWidth} justifyContent="flex-end">
          <box flexDirection="row" gap={1}>
            <text>tab</text>
            <text attributes={TextAttributes.DIM}>{footerHint}</text>
          </box>
        </box>
      </box>
    </box>
  );
}

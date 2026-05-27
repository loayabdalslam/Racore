import type { ReactNode } from "react";
import { Header } from "./header";
import { useTheme } from "../providers/theme";

type AppShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  contentHeight?: number;
};

export function AppShell({
  children,
  footer,
  maxWidth,
  contentHeight,
}: AppShellProps) {
  const { colors, fontSize } = useTheme();
  const shellWidth =
    maxWidth ?? (fontSize === "Small" ? 82 : fontSize === "Large" ? 66 : 74);

  return (
    <box
      width="100%"
      height="100%"
      flexGrow={1}
      alignItems="center"
      justifyContent="center"
      paddingX={2}
      paddingY={1}
    >
      <box
        width="100%"
        maxWidth={shellWidth}
        flexDirection="column"
        alignItems="center"
        gap={1}
      >
        <Header />
        <box
          width="100%"
          flexDirection="column"
          backgroundColor={colors.surface}
          paddingX={3}
          paddingY={2}
          gap={1}
        >
          {typeof contentHeight === "number" ? (
            <scrollbox height={contentHeight}>
              <box width="100%" flexDirection="column" gap={1} paddingRight={1}>
                {children}
              </box>
            </scrollbox>
          ) : (
            <box width="100%" flexDirection="column" gap={1}>
              {children}
            </box>
          )}
          {footer ? (
            <box width="100%" justifyContent="center">
              {footer}
            </box>
          ) : null}
        </box>
      </box>
    </box>
  );
}

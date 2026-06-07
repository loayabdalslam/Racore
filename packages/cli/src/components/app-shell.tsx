import { useEffect, useRef, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { Header } from "./header";
import { useTheme } from "../providers/theme";

type AppShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  contentHeight?: number;
  scrollTop?: number;
};

export function AppShell({
  children,
  footer,
  maxWidth,
  contentHeight,
  scrollTop,
}: AppShellProps) {
  const { colors, fontSize } = useTheme();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const shellWidth =
    maxWidth ?? (fontSize === "Small" ? 82 : fontSize === "Large" ? 66 : 74);

  useEffect(() => {
    if (typeof scrollTop !== "number") return;
    scrollRef.current?.scrollTo(Math.max(0, scrollTop));
  }, [scrollTop]);

  return (
    <box
      width="100%"
      height="100%"
      flexGrow={1}
      alignItems="center"
      justifyContent="center"
      paddingX={2}
      paddingY={1}
      overflow="hidden"
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
          border={["top", "bottom"]}
          borderColor={colors.dimSeparator}
        >
          {typeof contentHeight === "number" ? (
            <scrollbox ref={scrollRef} height={contentHeight}>
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

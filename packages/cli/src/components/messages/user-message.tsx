import { Mode, type ModeType } from "../../lib/app-schema";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";

type Props = {
  message: string;
  mode: ModeType;
};

export function UserMessage({ message, mode }: Props) {
  const { colors } = useTheme();
  const borderColor =
    mode === Mode.PLAN
      ? colors.planMode
      : mode === Mode.ULTRA
        ? colors.info
        : colors.primary;

  return (
    <box width="100%" alignItems="center">
      <box
        border={["left"]}
        borderColor={borderColor}
        width="100%"
        customBorderChars={{
          ...EmptyBorder,
          vertical: "┃",
          bottomLeft: "╹",
        }}
      >
        <box
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width="100%"
        >
          <text>{message}</text>
        </box>
      </box>
    </box>
  );
}

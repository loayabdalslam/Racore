import { TextAttributes } from "@opentui/core";
import { CLI_VERSION } from "../lib/app-info";
import { Mode } from "../lib/app-schema";
import { getModeLabel } from "./dialogs/agents-dialog";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";

export function StatusBar() {
  const { mode, model, provider } = usePromptConfig();
  const { colors } = useTheme();
  const modeLabel = getModeLabel(mode);
  const modeColor =
    mode === Mode.PLAN ? colors.planMode : mode === Mode.ULTRA ? colors.info : colors.primary;

  return (
    <box flexDirection="row" gap={1}>
      <text fg={modeColor}>{modeLabel}</text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>{">"}</text>
      <text>{provider}</text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>{">"}</text>
      <text>{model}</text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>{">"}</text>
      <text attributes={TextAttributes.DIM}>v{CLI_VERSION}</text>
    </box>
  );
}

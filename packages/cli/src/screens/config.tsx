import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import {
  AgentsDialogContent,
  FontSizeDialogContent,
  ThemeDialogContent,
} from "../components/dialogs";
import { getModeLabel } from "../components/dialogs/agents-dialog";
import { connectProvider } from "../lib/provider-auth";
import { getProviderDefinition } from "../lib/providers";
import { useDialog } from "../providers/dialog";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";

function SettingsRow({
  label,
  value,
  actionLabel,
  selected,
  onSelect,
  id,
}: {
  label: string;
  value: string;
  actionLabel: string;
  selected: boolean;
  onSelect: () => void;
  id: string;
}) {
  const { colors } = useTheme();

  return (
    <box
      id={id}
      width="100%"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      gap={1}
      backgroundColor={selected ? colors.selection : colors.dialogSurface}
      onMouseDown={onSelect}
    >
      <box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <text
          width="70%"
          attributes={TextAttributes.DIM}
          fg={selected ? "black" : colors.dimSeparator}
          wrapMode="word"
        >
          {label}
        </text>
        <text
          width="30%"
          fg={selected ? "black" : colors.info}
          textAlign="right"
        >
          [{actionLabel}]
        </text>
      </box>
      <text
        width="100%"
        fg={selected ? "black" : "white"}
        attributes={selected ? TextAttributes.BOLD : undefined}
        wrapMode="word"
      >
        {value}
      </text>
    </box>
  );
}

const ROW_ID = "settings-row";

export function ConfigScreen() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { isTopLayer } = useKeyboardLayer();
  const { provider, setProvider, mode, setMode } = usePromptConfig();
  const { colors, currentTheme, fontSize } = useTheme();
  const dimensions = useTerminalDimensions();
  const definition = getProviderDefinition(provider);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const contentHeight = Math.max(10, Math.min(18, dimensions.height - 16));

  const actions = [
    () => navigate(`/config/provider/${provider}`),
    async () => {
      try {
        await connectProvider(provider);
        setProvider(provider);
        dialog.close();
      } catch (error) {
        dialog.open({
          title: "CLI Login",
          children: (
            <box flexDirection="column" gap={1}>
              <text fg={colors.error} wrapMode="word">
                {error instanceof Error
                  ? error.message
                  : "Provider login failed."}
              </text>
            </box>
          ),
        });
      }
    },
    () => {
      dialog.open({
        title: "Select Mode",
        children: (
          <AgentsDialogContent currentMode={mode} onSelectMode={setMode} />
        ),
      });
    },
    () => {
      dialog.open({
        title: "Select Theme",
        children: <ThemeDialogContent />,
      });
    },
    () => {
      dialog.open({
        title: "Select Font Size",
        children: <FontSizeDialogContent />,
      });
    },
    () => navigate("/"),
    () => navigate("/onboarding"),
    () => navigate("/releases"),
  ];

  useKeyboard((key) => {
    if (!isTopLayer("base")) return;

    if (key.name === "up") {
      key.preventDefault();
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.name === "down") {
      key.preventDefault();
      setSelectedIndex((current) => Math.min(actions.length - 1, current + 1));
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      actions[selectedIndex]?.();
    }
  });

  const settingsRows = [
    {
      label: "Provider",
      value: definition.label,
      actionLabel: "Setup",
      onSelect: actions[0],
    },
    {
      label: "CLI Login",
      value: "Login to OpenRouter from the CLI and create a local Racore key.",
      actionLabel: "Login",
      onSelect: actions[1],
    },
    {
      label: "Mode",
      value: getModeLabel(mode),
      actionLabel: "Select",
      onSelect: actions[2],
    },
    {
      label: "Theme",
      value: currentTheme.name,
      actionLabel: "Dropdown",
      onSelect: actions[3],
    },
    {
      label: "Font Size",
      value: fontSize,
      actionLabel: "Dropdown",
      onSelect: actions[4],
    },
  ];

  const scrollToElementId =
    selectedIndex > 0
      ? selectedIndex < settingsRows.length - 1
        ? `${ROW_ID}-${selectedIndex}`
        : `${ROW_ID}-bottom`
      : `${ROW_ID}-top`;

  return (
    <AppShell
      maxWidth={fontSize === "Small" ? 82 : fontSize === "Large" ? 68 : 74}
      contentHeight={contentHeight}
      scrollToElementId={scrollToElementId}
      footer={
        <box flexDirection="row" gap={2}>
          <text
            fg={selectedIndex === 5 ? "black" : colors.info}
            backgroundColor={selectedIndex === 5 ? colors.selection : undefined}
            onMouseDown={actions[5]}
          >
            [Back]
          </text>
          <text
            fg={selectedIndex === 6 ? "black" : colors.info}
            backgroundColor={selectedIndex === 6 ? colors.selection : undefined}
            onMouseDown={actions[6]}
          >
            [Onboarding]
          </text>
          <text
            fg={selectedIndex === 7 ? "black" : colors.info}
            backgroundColor={selectedIndex === 7 ? colors.selection : undefined}
            onMouseDown={actions[7]}
          >
            [Releases]
          </text>
        </box>
      }
    >
      <box width="100%" justifyContent="center" id={`${ROW_ID}-top`}>
        <text attributes={TextAttributes.BOLD}>CONFIGURATION</text>
      </box>
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          Racore now runs through OpenRouter only. Configure login, mode, theme,
          and model here.
        </text>
      </box>
      {settingsRows.map((row, index) => (
        <SettingsRow
          key={index + row.label}
          label={row.label}
          value={row.value}
          actionLabel={row.actionLabel}
          selected={selectedIndex === index}
          onSelect={row.onSelect}
          id={`${ROW_ID}-${index}`}
        />
      ))}
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          Tab on the main page now cycles Normal, Plan, and Ultra.
        </text>
      </box>
      <box width="100%" justifyContent="center" id={`${ROW_ID}-bottom`}>
        <text attributes={TextAttributes.DIM}>
          Up/Down to move. Enter to select.
        </text>
      </box>
    </AppShell>
  );
}

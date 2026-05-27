import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import {
  AgentsDialogContent,
  FontSizeDialogContent,
  ProviderDialogContent,
  ThemeDialogContent,
} from "../components/dialogs";
import { getModeLabel } from "../components/dialogs/agents-dialog";
import { useDialog } from "../providers/dialog";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";
import { getProviderDefinition } from "../lib/providers";

function SettingsRow({
  label,
  value,
  actionLabel,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  actionLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  return (
    <box
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
    () => {
      dialog.open({
        title: "Select Provider",
        children: (
          <ProviderDialogContent
            onSelectProvider={(nextProvider) => {
              setProvider(nextProvider);
              navigate(`/config/provider/${nextProvider}`);
            }}
          />
        ),
      });
    },
    () => navigate(`/config/provider/${provider}`),
    () => {
      dialog.open({
        title: "Select Mode",
        children: (
          <AgentsDialogContent
            currentMode={mode}
            onSelectMode={setMode}
          />
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

  return (
    <AppShell
      maxWidth={fontSize === "Small" ? 82 : fontSize === "Large" ? 68 : 74}
      contentHeight={contentHeight}
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
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.BOLD}>CONFIGURATION</text>
      </box>
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          Provider, mode, theme, and font size live here. Open provider setup for auth, onboarding, and model controls.
        </text>
      </box>
      <SettingsRow
        label="Provider"
        value={definition.label}
        actionLabel="Dropdown"
        selected={selectedIndex === 0}
        onSelect={actions[0]}
      />
      <SettingsRow
        label="Provider Setup"
        value={`Open ${definition.shortLabel} auth, API key, and model page.`}
        actionLabel="Open"
        selected={selectedIndex === 1}
        onSelect={actions[1]}
      />
      <SettingsRow
        label="Mode"
        value={getModeLabel(mode)}
        actionLabel="Select"
        selected={selectedIndex === 2}
        onSelect={actions[2]}
      />
      <SettingsRow
        label="Theme"
        value={currentTheme.name}
        actionLabel="Dropdown"
        selected={selectedIndex === 3}
        onSelect={actions[3]}
      />
      <SettingsRow
        label="Font Size"
        value={fontSize}
        actionLabel="Dropdown"
        selected={selectedIndex === 4}
        onSelect={actions[4]}
      />
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          Tab on the main page now cycles Normal, Plan, and Ultra.
        </text>
      </box>
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.DIM}>
          Up/Down to move. Enter to select.
        </text>
      </box>
    </AppShell>
  );
}

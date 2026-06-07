import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useNavigate, useParams } from "react-router";
import open from "open";
import { AppShell } from "../components/app-shell";
import { ApiKeyDialogContent, ModelsDialogContent } from "../components/dialogs";
import { ProviderId, type ProviderIdType } from "../lib/app-schema";
import { getProviderModels } from "../lib/models";
import {
  clearProviderAuth,
  connectProvider,
  getProviderAuth,
  isProviderConnected,
} from "../lib/provider-auth";
import { getProviderDefinition, PROVIDERS } from "../lib/providers";
import { useDialog } from "../providers/dialog";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";
import { useToast } from "../providers/toast";

type ProviderAction = {
  label: string;
  value: string;
  actionLabel: string;
  onSelect: () => void | Promise<void>;
};

function ActionCard({
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
      backgroundColor={selected ? colors.selection : colors.dialogSurface}
      paddingX={2}
      paddingY={1}
      gap={1}
      onMouseDown={onSelect}
    >
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={selected ? "black" : colors.dimSeparator}>{label}</text>
        <text fg={selected ? "black" : colors.info}>[{actionLabel}]</text>
      </box>
      <text
        fg={selected ? "black" : "white"}
        attributes={selected ? TextAttributes.BOLD : undefined}
        wrapMode="word"
      >
        {value}
      </text>
    </box>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { colors } = useTheme();

  return (
    <box
      width={24}
      flexDirection="column"
      backgroundColor={colors.dialogSurface}
      paddingX={2}
      paddingY={1}
      gap={1}
    >
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        {label}
      </text>
      <text attributes={TextAttributes.BOLD} wrapMode="word">
        {value}
      </text>
    </box>
  );
}

function OpenAIAccountLoginNotice() {
  const { colors } = useTheme();

  return (
    <box flexDirection="column" gap={1}>
      <text fg={colors.dimSeparator} wrapMode="word">
        OpenAI account login is available in the official Codex CLI with `codex login`.
      </text>
      <text fg={colors.dimSeparator} wrapMode="word">
        Racore currently sends OpenAI-compatible API requests, so it cannot use a ChatGPT browser session as an API token.
      </text>
      <text fg={colors.info} wrapMode="word">
        To use OpenAI directly in Racore, set OPENAI_API_KEY or use Save API Key. To use your ChatGPT account, run `codex login` in your terminal for Codex CLI.
      </text>
    </box>
  );
}

export function ProviderScreen() {
  const params = useParams();
  const providerFromRoute =
    (params.providerId as ProviderIdType | undefined) ?? ProviderId.OPENAI;
  const provider = PROVIDERS.some((item) => item.id === providerFromRoute)
    ? providerFromRoute
    : ProviderId.OPENAI;

  const navigate = useNavigate();
  const dialog = useDialog();
  const toast = useToast();
  const dimensions = useTerminalDimensions();
  const { isTopLayer } = useKeyboardLayer();
  const { colors, fontSize } = useTheme();
  const { setProvider, setModel, getModelForProvider } = usePromptConfig();
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const definition = getProviderDefinition(provider);
  const auth = getProviderAuth(provider);
  const models = getProviderModels(provider);
  const providerModel = getModelForProvider(provider);
  const authState = isProviderConnected(provider) ? "Connected" : "Not connected";
  const contentHeight = Math.max(10, Math.min(18, dimensions.height - 15));
  const rowHeight = 4;
  const centeredScrollTop = Math.max(
    0,
    selectedIndex * rowHeight - Math.floor(contentHeight / 2) + Math.ceil(rowHeight / 2),
  );

  const actions: ProviderAction[] = [
    {
      label: "Set Active",
      value: `Use ${definition.shortLabel} for new chats.`,
      actionLabel: "Activate",
      onSelect: () => {
        setProvider(provider);
        toast.show({ variant: "success", message: `${definition.label} is now active.` });
      },
    },
    {
      label: "CLI Login",
      value: provider === ProviderId.OPENAI
        ? "Use `codex login` for ChatGPT account auth. Racore OpenAI API calls still need an API key."
        : definition.supportsOAuth
          ? "Start browser login and local key exchange."
          : "Open the provider console to create a key.",
      actionLabel: busy ? "Working..." : provider === ProviderId.OPENAI ? "Info" : definition.supportsOAuth ? "Login" : "Open",
      onSelect: async () => {
        if (provider === ProviderId.OPENAI) {
          dialog.open({
            title: "OpenAI Account Login",
            children: <OpenAIAccountLoginNotice />,
          });
          return;
        }

        setBusy(true);
        try {
          await connectProvider(provider);
          setProvider(provider);
          toast.show({ variant: "success", message: `${definition.label} connected.` });
        } catch (error) {
          toast.show({
            variant: "error",
            message:
              error instanceof Error
                ? error.message
                : `Could not connect ${definition.label}.`,
          });
        } finally {
          setBusy(false);
        }
      },
    },
    {
      label: "API Key",
      value: auth.apiKey
        ? "Local key saved in ~/.racore/auth.json."
        : `Use ${definition.envVar} or paste a local key.`,
      actionLabel: "Save",
      onSelect: () => {
        dialog.open({
          title: `Save ${definition.shortLabel} API Key`,
          children: (
            <ApiKeyDialogContent provider={provider} providerLabel={definition.label} />
          ),
        });
      },
    },
    {
      label: "Model",
      value: providerModel,
      actionLabel: "Choose",
      onSelect: () => {
        setProvider(provider);
        dialog.open({
          title: "Select Model",
          children: (
            <ModelsDialogContent
              models={models.map((item) => item.id)}
              onSelectModel={(modelId) => {
                setProvider(provider);
                setModel(modelId);
                toast.show({ message: `Selected ${modelId}.` });
              }}
            />
          ),
        });
      },
    },
    {
      label: "Provider Console",
      value: definition.browserLabel,
      actionLabel: "Open",
      onSelect: () => void open(definition.browserUrl),
    },
    {
      label: "Disconnect",
      value: isProviderConnected(provider)
        ? "Remove local credentials for this provider."
        : "No local credentials saved yet.",
      actionLabel: "Clear",
      onSelect: () => {
        clearProviderAuth(provider);
        toast.show({
          variant: "success",
          message: `${definition.label} credentials cleared.`,
        });
      },
    },
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
      void actions[selectedIndex]?.onSelect();
      return;
    }

    if (key.name === "escape") {
      key.preventDefault();
      navigate("/config");
    }
  });

  return (
    <AppShell
      maxWidth={fontSize === "Small" ? 84 : fontSize === "Large" ? 70 : 76}
      contentHeight={contentHeight}
      scrollTop={centeredScrollTop}
      footer={
        <box flexDirection="row" gap={3}>
          <text fg={colors.info} onMouseDown={() => navigate("/config")}>
            [Back]
          </text>
          <text fg={colors.info} onMouseDown={() => navigate("/")}>
            [Home]
          </text>
        </box>
      }
    >
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.BOLD}>{definition.label.toUpperCase()}</text>
      </box>
      <box width="100%" justifyContent="center" paddingX={1}>
        <text width="100%" fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          {definition.description}
        </text>
      </box>
      <box width="100%" justifyContent="center" paddingX={1}>
        <text width="100%" fg={colors.info} wrapMode="word" textAlign="center">
          Pick one setup path below, then choose the model you want to use.
        </text>
      </box>
      <box width="100%" justifyContent="center">
        <box flexDirection="row" gap={2}>
          <SummaryCard label="Status" value={authState} />
          <SummaryCard label="Model" value={providerModel} />
        </box>
      </box>
      {actions.map((action, index) => (
        <ActionCard
          key={action.label}
          label={action.label}
          value={action.value}
          actionLabel={action.actionLabel}
          selected={selectedIndex === index}
          onSelect={() => void action.onSelect()}
        />
      ))}
      <box width="100%" flexDirection="column" gap={1} paddingTop={1}>
        <text attributes={TextAttributes.BOLD}>AVAILABLE MODELS</text>
        {models.map((item) => (
          <box
            key={item.id}
            width="100%"
            flexDirection="column"
            backgroundColor={item.id === providerModel ? colors.dialogSurface : colors.background}
          paddingX={2}
          paddingY={1}
            gap={1}
          >
            <text
              width="100%"
              fg={item.id === providerModel ? colors.primary : "white"}
              attributes={item.id === providerModel ? TextAttributes.BOLD : undefined}
              wrapMode="word"
            >
              {item.label}
            </text>
            <text width="100%" fg={colors.dimSeparator} wrapMode="word">
              {item.capability}
            </text>
          </box>
        ))}
      </box>
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.DIM}>
          Up/Down to move. Enter to select. Esc to go back.
        </text>
      </box>
    </AppShell>
  );
}

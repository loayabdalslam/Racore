import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { saveConfig } from "../lib/config-store";
import { DEFAULT_OPENROUTER_MODEL_ID } from "../lib/models";
import { connectProvider, isProviderConnected } from "../lib/provider-auth";
import { getProviderDefinition } from "../lib/providers";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";
import { useToast } from "../providers/toast";
import { THEMES, type Theme } from "../theme";

type OnboardingStep = "theme" | "login" | "finish";

const STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: "theme", label: "Theme" },
  { id: "login", label: "Login" },
  { id: "finish", label: "Finish" },
];

function OptionRow({
  title,
  description,
  selected,
  active,
  onSelect,
  id,
}: {
  title: string;
  description: string;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  id: string;
}) {
  const { colors } = useTheme();

  return (
    <box
      id={id}
      width="100%"
      flexDirection="column"
      backgroundColor={
        selected
          ? colors.selection
          : active
            ? colors.dialogSurface
            : colors.background
      }
      paddingX={2}
      paddingY={1}
      gap={1}
      onMouseDown={onSelect}
    >
      <text
        fg={selected ? "black" : active ? colors.primary : "white"}
        attributes={selected || active ? TextAttributes.BOLD : undefined}
        wrapMode="word"
      >
        {active ? "[x] " : "[ ] "}
        {title}
      </text>
      <text fg={selected ? "black" : colors.dimSeparator} wrapMode="word">
        {description}
      </text>
    </box>
  );
}

const idMap: Record<number, string> = {
  0: "theme-row",
  1: "login-row",
  2: "finish-row",
};

export function OnboardingScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const dimensions = useTerminalDimensions();
  const { isTopLayer } = useKeyboardLayer();
  const { colors, currentTheme, setTheme, fontSize } = useTheme();
  const { provider, setProvider, mode, model, setModel } = usePromptConfig();
  const [loginConnected, setLoginConnected] = useState(() =>
    isProviderConnected(provider),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const step = STEPS[stepIndex]!;
  const contentHeight = Math.max(12, Math.min(20, dimensions.height - 13));
  const itemsLength =
    step.id === "theme" ? THEMES.length : step.id === "login" ? 1 : 0;
  const continueIndex = itemsLength;

  const finishOnboarding = () => {
    if (model !== DEFAULT_OPENROUTER_MODEL_ID) {
      setModel(DEFAULT_OPENROUTER_MODEL_ID);
    }
    saveConfig({
      activeProvider: provider,
      mode,
      modelByProvider: {
        [provider]: DEFAULT_OPENROUTER_MODEL_ID,
      },
    });
    toast.show({ variant: "success", message: "Onboarding complete." });
    navigate("/");
  };

  const chooseCurrent = async () => {
    if (step.id === "finish") {
      finishOnboarding();
      return;
    }

    if (selectedIndex === continueIndex) {
      setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
      setSelectedIndex(0);
      return;
    }

    if (step.id === "login") {
      const definition = getProviderDefinition(provider);
      try {
        await connectProvider(provider);
        setProvider(provider);
        setLoginConnected(true);
        toast.show({
          variant: "success",
          message: `${definition.label} connected.`,
        });
      } catch (error) {
        toast.show({
          variant: "error",
          message:
            error instanceof Error
              ? error.message
              : `${definition.label} login failed.`,
        });
      }
      return;
    }

    if (step.id === "theme") {
      setTheme(THEMES[selectedIndex] as Theme);
      return;
    }
  };

  useKeyboard((key) => {
    if (!isTopLayer("base")) return;

    if (key.name === "up") {
      key.preventDefault();
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.name === "down") {
      key.preventDefault();
      setSelectedIndex((current) => Math.min(continueIndex, current + 1));
      return;
    }

    if (key.name === "left" && stepIndex > 0) {
      key.preventDefault();
      setStepIndex((current) => current - 1);
      setSelectedIndex(0);
      return;
    }

    if (key.name === "right" && stepIndex < STEPS.length - 1) {
      key.preventDefault();
      setStepIndex((current) => current + 1);
      setSelectedIndex(0);
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      void chooseCurrent();
      return;
    }

    if (key.name === "escape") {
      key.preventDefault();
      navigate("/config");
    }
  });

  const scrollToElementId =
    selectedIndex > 0
      ? selectedIndex < itemsLength
        ? `${idMap[stepIndex]}-${selectedIndex}`
        : "onboarding-row-bottom"
      : "onboarding-row-top";

  return (
    <AppShell
      maxWidth={fontSize === "Small" ? 86 : fontSize === "Large" ? 70 : 78}
      contentHeight={contentHeight}
      scrollToElementId={scrollToElementId}
      footer={
        <box flexDirection="row" gap={2}>
          <text fg={colors.info} onMouseDown={() => navigate("/config")}>
            [Config]
          </text>
          <text fg={colors.info} onMouseDown={() => navigate("/")}>
            [Skip]
          </text>
        </box>
      }
    >
      <box width="100%" justifyContent="center" id="onboarding-row-top">
        <text attributes={TextAttributes.BOLD}>WELCOME TO R'A CORE</text>
      </box>
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          First run setup. Pick a theme and connect OpenRouter. Default model:{" "}
          {DEFAULT_OPENROUTER_MODEL_ID}.
        </text>
      </box>
      <box width="100%" flexDirection="row" justifyContent="center" gap={2}>
        {STEPS.map((item, index) => (
          <text
            key={item.id}
            fg={index === stepIndex ? "black" : colors.info}
            backgroundColor={index === stepIndex ? colors.selection : undefined}
            attributes={index === stepIndex ? TextAttributes.BOLD : undefined}
          >
            [{index + 1}. {item.label}]
          </text>
        ))}
      </box>
      <box width="100%" justifyContent="center">
        <text fg={colors.primary} attributes={TextAttributes.BOLD}>
          Select {step.label}
        </text>
      </box>
      {step.id === "theme" &&
        THEMES.map((theme, index) => (
          <OptionRow
            id={`${idMap[stepIndex]}-${index}`}
            key={theme.name}
            title={theme.name}
            description="Applies instantly to the CLI."
            selected={selectedIndex === index}
            active={theme.name === currentTheme.name}
            onSelect={() => {
              setSelectedIndex(index);
              setTheme(theme);
            }}
          />
        ))}
      {step.id === "login" && (
        <OptionRow
          id={`${idMap[stepIndex]}`}
          title={`${getProviderDefinition(provider).shortLabel} CLI login`}
          description={
            loginConnected
              ? "OpenRouter is connected. Continue to finish onboarding."
              : "Start OpenRouter browser login and local key exchange."
          }
          selected={selectedIndex === 0}
          active={loginConnected}
          onSelect={() => {
            setSelectedIndex(0);
            void chooseCurrent();
          }}
        />
      )}
      {step.id === "finish" && (
        <OptionRow
          id={`${idMap[stepIndex]}`}
          title="Finish onboarding"
          description={`Save ~/.racore/config.json and start with ${DEFAULT_OPENROUTER_MODEL_ID}.`}
          selected={selectedIndex === 0}
          active={true}
          onSelect={finishOnboarding}
        />
      )}
      {step.id !== "finish" && (
        <OptionRow
          id={`${idMap[stepIndex]}-${continueIndex}`}
          title="Continue"
          description={`Next: ${STEPS[stepIndex + 1]?.label}`}
          selected={selectedIndex === continueIndex}
          active={false}
          onSelect={() => {
            setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
            setSelectedIndex(0);
          }}
        />
      )}
      <box width="100%" justifyContent="center" id={`onboarding-row-bottom`}>
        <text attributes={TextAttributes.DIM}>
          Up/Down to move. Enter to choose. Left/Right changes step.
        </text>
      </box>
    </AppShell>
  );
}

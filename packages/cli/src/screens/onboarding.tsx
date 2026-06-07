import { useMemo, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { getProviderModels } from "../lib/models";
import { connectProvider } from "../lib/provider-auth";
import { getProviderDefinition } from "../lib/providers";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useTheme } from "../providers/theme";
import { useToast } from "../providers/toast";
import { THEMES, type Theme } from "../theme";

type OnboardingStep = "theme" | "login" | "model";

const STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: "theme", label: "Theme" },
  { id: "login", label: "Login" },
  { id: "model", label: "Model" },
];

function OptionRow({
  title,
  description,
  selected,
  active,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  return (
    <box
      width="100%"
      flexDirection="column"
      backgroundColor={selected ? colors.selection : active ? colors.dialogSurface : colors.background}
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

export function OnboardingScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const dimensions = useTerminalDimensions();
  const { isTopLayer } = useKeyboardLayer();
  const { colors, currentTheme, setTheme, fontSize } = useTheme();
  const { provider, setProvider, model, setModel } = usePromptConfig();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const step = STEPS[stepIndex]!;
  const models = useMemo(() => getProviderModels(provider), [provider]);
  const contentHeight = Math.max(12, Math.min(20, dimensions.height - 13));
  const rowHeight = 4;
  const itemsLength =
    step.id === "theme"
      ? THEMES.length
      : step.id === "login"
        ? 1
        : models.length;
  const footerIndex = itemsLength;
  const centeredScrollTop = Math.max(
    0,
    selectedIndex * rowHeight - Math.floor(contentHeight / 2) + Math.ceil(rowHeight / 2),
  );

  const chooseCurrent = async () => {
    if (selectedIndex === footerIndex) {
      if (stepIndex === STEPS.length - 1) {
        toast.show({ variant: "success", message: "Onboarding complete." });
        navigate("/");
      } else {
        setStepIndex((current) => current + 1);
        setSelectedIndex(0);
      }
      return;
    }

    if (step.id === "login") {
      const definition = getProviderDefinition(provider);
      try {
        await connectProvider(provider);
        setProvider(provider);
        toast.show({ variant: "success", message: `${definition.label} connected.` });
      } catch (error) {
        toast.show({
          variant: "error",
          message: error instanceof Error ? error.message : `${definition.label} login failed.`,
        });
      }
      return;
    }

    if (step.id === "theme") {
      setTheme(THEMES[selectedIndex] as Theme);
      return;
    }

    const nextModel = models[selectedIndex]?.id;
    if (nextModel) {
      setModel(nextModel);
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
      setSelectedIndex((current) => Math.min(footerIndex, current + 1));
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

  return (
    <AppShell
      maxWidth={fontSize === "Small" ? 86 : fontSize === "Large" ? 70 : 78}
      contentHeight={contentHeight}
      scrollTop={centeredScrollTop}
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
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.BOLD}>WELCOME TO R'A CORE</text>
      </box>
      <box width="100%" justifyContent="center">
        <text fg={colors.dimSeparator} wrapMode="word" textAlign="center">
          First run setup. Pick a theme, connect OpenRouter, and choose a model.
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
      {step.id === "model" &&
        models.map((item, index) => (
          <OptionRow
            key={item.id}
            title={item.label}
            description={`${getProviderDefinition(item.provider).shortLabel}: ${item.capability}`}
            selected={selectedIndex === index}
            active={item.id === model}
            onSelect={() => {
              setSelectedIndex(index);
              setModel(item.id);
            }}
          />
        ))}
      {step.id === "login" && (
        <OptionRow
          title={`${getProviderDefinition(provider).shortLabel} CLI login`}
          description="Start OpenRouter browser login and local key exchange."
          selected={selectedIndex === 0}
          active={false}
          onSelect={() => {
            setSelectedIndex(0);
            void chooseCurrent();
          }}
        />
      )}
      <OptionRow
        title={stepIndex === STEPS.length - 1 ? "Finish onboarding" : "Continue"}
        description={stepIndex === STEPS.length - 1 ? "Go to the home screen." : `Next: ${STEPS[stepIndex + 1]?.label}`}
        selected={selectedIndex === footerIndex}
        active={false}
        onSelect={chooseCurrent}
      />
      <box width="100%" justifyContent="center">
        <text attributes={TextAttributes.DIM}>
          Up/Down to move. Enter to choose. Left/Right changes step.
        </text>
      </box>
    </AppShell>
  );
}

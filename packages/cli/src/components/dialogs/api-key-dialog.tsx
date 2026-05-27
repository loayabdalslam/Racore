import { useCallback, useRef, useState } from "react";
import type { InputRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { ProviderId, type ProviderIdType } from "../../lib/app-schema";
import { refreshOpenRouterModels } from "../../lib/models";
import { saveProviderApiKey } from "../../lib/provider-auth";
import { useDialog } from "../../providers/dialog";
import { useKeyboardLayer } from "../../providers/keyboard-layer";
import { useToast } from "../../providers/toast";
import { useTheme } from "../../providers/theme";

type Props = {
  provider: ProviderIdType;
  providerLabel: string;
};

export function ApiKeyDialogContent({ provider, providerLabel }: Props) {
  const dialog = useDialog();
  const toast = useToast();
  const { isTopLayer } = useKeyboardLayer();
  const { colors } = useTheme();
  const inputRef = useRef<InputRenderable>(null);
  const [value, setValue] = useState("");

  const save = useCallback(async () => {
    const apiKey = inputRef.current?.value?.trim() ?? value.trim();
    if (!apiKey) {
      toast.show({ variant: "error", message: "Paste an API key before saving." });
      return;
    }

    saveProviderApiKey(provider, apiKey);
    if (provider === ProviderId.OPENROUTER) {
      await refreshOpenRouterModels(apiKey);
    }
    toast.show({ variant: "success", message: `${providerLabel} API key saved.` });
    dialog.close();
  }, [dialog, provider, providerLabel, toast, value]);

  useKeyboard((key) => {
    if (!isTopLayer("dialog")) return;

    if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      void save();
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      <text fg={colors.dimSeparator}>
        Paste your API key, then press Enter to save it locally.
      </text>
      <input
        ref={inputRef}
        focused
        placeholder="sk-..."
        onContentChange={() => setValue(inputRef.current?.value ?? "")}
      />
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.dimSeparator}>Stored in ~/.racore/auth.json</text>
        <text fg={colors.info} onMouseDown={() => void save()}>
          [Save]
        </text>
      </box>
    </box>
  );
}

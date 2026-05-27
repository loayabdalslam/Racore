import { useCallback } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { InputBar } from "../components/input-bar";
import { usePromptConfig } from "../providers/prompt-config";
import { TextAttributes } from "@opentui/core";

export function Home() {
  const navigate = useNavigate();
  const { mode, model } = usePromptConfig();

  const handleSubmit = useCallback(
    (text: string) => {
      navigate("/sessions/new", { state: { message: text, mode, model } });
    },
    [navigate, mode, model],
  );

  return (
    <AppShell
      maxWidth={64}
      footer={
        <box flexDirection="row" gap={1}>
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>mode</text>
        </box>
      }
    >
      <box width="100%" flexDirection="column" gap={1}>
        <InputBar onSubmit={handleSubmit} />
      </box>
    </AppShell>
  );
};

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { loadConfig, saveConfig } from "../../lib/config-store";
import { getDefaultModel } from "../../lib/models";
import {
  Mode,
  type ModeType,
  type ProviderIdType,
} from "../../lib/app-schema";

type PromptConfigContextValue = {
  mode: ModeType;
  toggleMode: () => void;
  setMode: (mode: ModeType) => void;
  provider: ProviderIdType;
  setProvider: (provider: ProviderIdType) => void;
  model: string;
  getModelForProvider: (provider: ProviderIdType) => string;
  setModel: (model: string) => void;
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(null);

export function usePromptConfig(): PromptConfigContextValue {
  const value = useContext(PromptConfigContext);
  if (!value) {
    throw new Error("usePromptConfig must be used within a PromptConfigProvider");
  }
  return value;
}

type PromptConfigProviderProps = {
  children: ReactNode;
};

export function PromptConfigProvider({ children }: PromptConfigProviderProps) {
  const initialConfig = loadConfig();
  const [mode, setModeState] = useState<ModeType>(initialConfig.mode);
  const [provider, setProviderState] = useState<ProviderIdType>(initialConfig.activeProvider);
  const [modelByProvider, setModelByProvider] = useState<Record<ProviderIdType, string>>(
    initialConfig.modelByProvider,
  );

  const persist = useCallback(
    (next: {
      mode?: ModeType;
      provider?: ProviderIdType;
      modelByProvider?: Record<ProviderIdType, string>;
    }) => {
      saveConfig({
        mode: next.mode ?? mode,
        activeProvider: next.provider ?? provider,
        modelByProvider: next.modelByProvider ?? modelByProvider,
      });
    },
    [mode, provider, modelByProvider],
  );

  const toggleMode = useCallback(() => {
    setModeState((currentMode) => {
      const nextMode =
        currentMode === Mode.BUILD
          ? Mode.PLAN
          : currentMode === Mode.PLAN
            ? Mode.ULTRA
            : Mode.BUILD;
      persist({ mode: nextMode });
      return nextMode;
    });
  }, [persist]);

  const setMode = useCallback((nextMode: ModeType) => {
    setModeState(nextMode);
    persist({ mode: nextMode });
  }, [persist]);

  const setProvider = useCallback((nextProvider: ProviderIdType) => {
    setProviderState(nextProvider);
    const nextModels = {
      ...modelByProvider,
      [nextProvider]: modelByProvider[nextProvider] ?? getDefaultModel(nextProvider).id,
    };
    setModelByProvider(nextModels);
    persist({ provider: nextProvider, modelByProvider: nextModels });
  }, [modelByProvider, persist]);

  const setModel = useCallback((nextModel: string) => {
    const nextModels = { ...modelByProvider, [provider]: nextModel };
    setModelByProvider(nextModels);
    persist({ modelByProvider: nextModels });
  }, [modelByProvider, persist, provider]);

  const getModelForProvider = useCallback((targetProvider: ProviderIdType) => {
    return modelByProvider[targetProvider] ?? getDefaultModel(targetProvider).id;
  }, [modelByProvider]);

  return (
    <PromptConfigContext.Provider
      value={{
        mode,
        toggleMode,
        setMode,
        provider,
        setProvider,
        model: modelByProvider[provider] ?? getDefaultModel(provider).id,
        getModelForProvider,
        setModel,
      }}
    >
      {children}
    </PromptConfigContext.Provider>
  );
}

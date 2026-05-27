import { readFileSync, writeFileSync } from "node:fs";
import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { ThemeColors, Theme } from "../../theme";
import { DEFAULT_THEME, THEMES } from "../../theme";
import { ensureAppDirectories, THEME_PREFERENCES_PATH } from "../../lib/app-paths";

type ThemePreferences = {
  themeName: string;
  fontSize: FontSize;
};

export const FONT_SIZES = ["Small", "Medium", "Large"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

function getInitialTheme(): Theme {
  try {
    const preferences = JSON.parse(
      readFileSync(THEME_PREFERENCES_PATH, "utf8"),
    ) as Partial<ThemePreferences>;
    const savedTheme = THEMES.find((theme) => theme.name === preferences.themeName);
    return savedTheme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

function getInitialFontSize(): FontSize {
  try {
    const preferences = JSON.parse(
      readFileSync(THEME_PREFERENCES_PATH, "utf8"),
    ) as Partial<ThemePreferences>;
    return FONT_SIZES.find((size) => size === preferences.fontSize) ?? "Medium";
  } catch {
    return "Medium";
  }
}

function persistPreferences(theme: Theme, fontSize: FontSize) {
  try {
    ensureAppDirectories();
    writeFileSync(
      THEME_PREFERENCES_PATH,
      JSON.stringify({ themeName: theme.name, fontSize } satisfies ThemePreferences, null, 2),
      "utf8",
    );
  } catch {
    // Ignore preference write failures so theme switching still works for this session.
  }
};

type ThemeContextValue = {
  colors: ThemeColors;
  currentTheme: Theme;
  fontSize: FontSize;
  setTheme: (theme: Theme) => void;
  setFontSize: (fontSize: FontSize) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return value;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme);
  const [fontSize, setCurrentFontSize] = useState<FontSize>(getInitialFontSize);

  const setTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    persistPreferences(theme, fontSize);
  }, [fontSize]);

  const setFontSize = useCallback((nextFontSize: FontSize) => {
    setCurrentFontSize(nextFontSize);
    persistPreferences(currentTheme, nextFontSize);
  }, [currentTheme]);

  return (
    <ThemeContext.Provider 
      value={{
        colors: currentTheme.colors,
        currentTheme,
        fontSize,
        setTheme,
        setFontSize,
      }}>
      {children}
    </ThemeContext.Provider>
  );
};

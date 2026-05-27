import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_DIR = join(homedir(), ".racore");
export const SESSIONS_DIR = join(APP_DIR, "sessions");
export const AUTH_FILE = join(APP_DIR, "auth.json");
export const CONFIG_FILE = join(APP_DIR, "config.json");
export const MODELS_FILE = join(APP_DIR, "models.json");
export const THEME_PREFERENCES_PATH = join(APP_DIR, "preferences.json");

export function ensureAppDirectories() {
  mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
}

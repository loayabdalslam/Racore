import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import open from "open";
import { AUTH_FILE, ensureAppDirectories } from "./app-paths";
import { ProviderId, type AuthState, type ProviderAuthState, type ProviderIdType } from "./app-schema";
import { refreshOpenRouterModels } from "./models";

const EMPTY_AUTH_STATE: AuthState = {
  [ProviderId.OPENROUTER]: {},
};

function loadAuthState(): AuthState {
  try {
    if (!existsSync(AUTH_FILE)) {
      return EMPTY_AUTH_STATE;
    }

    const parsed = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Partial<AuthState>;
    return {
      [ProviderId.OPENROUTER]: parsed.openrouter ?? {},
    };
  } catch {
    return EMPTY_AUTH_STATE;
  }
}

function saveAuthState(state: AuthState) {
  ensureAppDirectories();
  writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function getProviderAuth(provider: ProviderIdType): ProviderAuthState {
  return loadAuthState()[provider] ?? {};
}

export function isProviderConnected(provider: ProviderIdType) {
  const auth = getProviderAuth(provider);
  return typeof auth.apiKey === "string" && auth.apiKey.length > 0;
}

export function saveProviderAuth(provider: ProviderIdType, nextState: ProviderAuthState) {
  const current = loadAuthState();
  current[provider] = nextState;
  saveAuthState(current);
}

export function saveProviderApiKey(provider: ProviderIdType, apiKey: string) {
  saveProviderAuth(provider, {
    apiKey: apiKey.trim(),
    connectedAt: new Date().toISOString(),
    authType: "api-key",
  });
}

export function clearProviderAuth(provider: ProviderIdType) {
  const current = loadAuthState();
  current[provider] = {};
  saveAuthState(current);
}

export function clearAllAuth() {
  try {
    unlinkSync(AUTH_FILE);
  } catch {
    // Ignore if the file is already missing.
  }
}

function toBase64Url(input: Uint8Array | string) {
  return Buffer.from(input).toString("base64url");
}

async function createPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

function getRandomCallbackPort() {
  const rangeStart = 49_152;
  const rangeSize = 65_535 - rangeStart;
  const bytes = crypto.getRandomValues(new Uint16Array(1));
  return rangeStart + (bytes[0]! % rangeSize);
}

export async function connectOpenRouter() {
  const nonce = crypto.randomUUID();
  const codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = await createPkceChallenge(codeVerifier);
  let settled = false;

  return new Promise<void>((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve> | null = null;

    const callbackHandler = async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        settled = true;
        reject(new Error(error));
        setTimeout(() => server?.stop(), 500);
        return new Response(`Authentication failed: ${error}`, { status: 400 });
      }

      if (!code || !returnedState || returnedState !== nonce) {
        settled = true;
        reject(new Error("Invalid OpenRouter callback state"));
        setTimeout(() => server?.stop(), 500);
        return new Response("Invalid callback state", { status: 400 });
      }

      try {
        const exchange = await fetch("https://openrouter.ai/api/v1/auth/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            code_challenge_method: "S256",
          }),
        });

        if (!exchange.ok) {
          throw new Error(await exchange.text());
        }

        const data = (await exchange.json()) as { key?: string };
        if (!data.key) {
          throw new Error("OpenRouter did not return an API key");
        }

        saveProviderAuth(ProviderId.OPENROUTER, {
          apiKey: data.key,
          connectedAt: new Date().toISOString(),
          authType: "oauth",
        });
        await refreshOpenRouterModels(data.key);

        settled = true;
        resolve();
        setTimeout(() => server?.stop(), 500);
        return new Response("R'a Core connected to OpenRouter. You can close this tab.");
      } catch (error) {
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
        setTimeout(() => server?.stop(), 500);
        return new Response("OpenRouter connection failed.", { status: 400 });
      }
    };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        server = Bun.serve({
          port: getRandomCallbackPort(),
          fetch: callbackHandler,
        });
        break;
      } catch {
        server = null;
      }
    }

    if (!server) {
      reject(new Error("Failed to start local callback server on a random high port"));
      return;
    }

    const port = server.port;
    if (typeof port !== "number") {
      server.stop();
      reject(new Error("Failed to start local callback server"));
      return;
    }

    const callbackUrl = `http://localhost:${port}/callback`;
    const authorizeUrl = new URL(`https://openrouter.ai/auth?callback_url=${callbackUrl}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${nonce}&key_label=racore`);
    authorizeUrl.searchParams.set("callback_url", callbackUrl);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", nonce);
    authorizeUrl.searchParams.set("key_label", "racore");

    void open(authorizeUrl.toString());

    setTimeout(() => {
      if (!settled) {
        settled = true;
        server?.stop();
        reject(new Error("OpenRouter login timed out"));
      }
    }, 5 * 60 * 1000).unref();
  });
}

export async function connectProvider(_provider: ProviderIdType) {
  return connectOpenRouter();
}

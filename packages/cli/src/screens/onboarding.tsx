import { useNavigate } from "react-router";
import { CenteredPage } from "../components/centered-page";

const ONBOARDING_LINES = [
  "1. Copy .env.example to .env",
  "2. Set OPENAI_API_KEY for Codex/OpenAI if needed",
  "3. Run bun install",
  "4. Run bun run dev:cli",
  "5. Open /config and connect your providers",
  "6. Run npm login before publishing",
  "7. Publish with npm publish --workspace @loai/racore-cli --access public",
  "8. Update CHANGELOG.md before each release",
];

export function OnboardingScreen() {
  const navigate = useNavigate();

  return (
    <CenteredPage
      title="Onboarding"
      description="Setup, publish, and release checklist for the npm CLI package."
      actions={[
        { label: "Back", onSelect: () => navigate("/config"), tone: "muted" },
        { label: "Continue to Releases", onSelect: () => navigate("/releases") },
        { label: "Home", onSelect: () => navigate("/") },
      ]}
    >
      <box flexDirection="column" gap={1} paddingY={1}>
        {ONBOARDING_LINES.map((line) => (
          <text key={line} wrapMode="word">{line}</text>
        ))}
      </box>
    </CenteredPage>
  );
}

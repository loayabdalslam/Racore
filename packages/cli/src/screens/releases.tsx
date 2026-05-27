import { useNavigate } from "react-router";
import { CenteredPage } from "../components/centered-page";
import { APP_NAME, CLI_DESCRIPTION, CLI_VERSION } from "../lib/app-info";
import { RELEASE_NOTES } from "../lib/release-notes";
import { performSelfUpdate } from "../lib/self-update";
import { useTheme } from "../providers/theme";
import { useToast } from "../providers/toast";

export function ReleasesScreen() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const toast = useToast();

  return (
    <CenteredPage
      title={`${APP_NAME} Releases`}
      description={CLI_DESCRIPTION}
      actions={[
        { label: "Back", onSelect: () => navigate("/config"), tone: "muted" },
        { label: "Onboarding", onSelect: () => navigate("/onboarding") },
        {
          label: "Update Now",
          onSelect: () => {
            void performSelfUpdate().then((result) => {
              toast.show({
                variant: result.ok ? "success" : "error",
                duration: result.ok ? 6000 : 8000,
                message: result.message,
              });
            });
          },
          tone: "primary",
        },
        { label: "Home", onSelect: () => navigate("/") },
      ]}
    >
      <text wrapMode="word">Current version: {CLI_VERSION}</text>
      {RELEASE_NOTES.map((release) => (
        <box
          key={release.version}
          flexDirection="column"
          border={["left"]}
          borderColor={colors.primary}
          paddingLeft={2}
          paddingY={1}
          gap={1}
        >
          <text wrapMode="word">{release.version} - {release.title}</text>
          <text wrapMode="word">{release.description}</text>
          {release.changes.map((change) => (
            <text key={change} wrapMode="word">- {change}</text>
          ))}
        </box>
      ))}
    </CenteredPage>
  );
}

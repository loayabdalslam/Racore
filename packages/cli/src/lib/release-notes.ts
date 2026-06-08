export type ReleaseNote = {
  version: string;
  title: string;
  description: string;
  changes: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.0.0",
    title: "Standalone Rewrite",
    description: "Turned R'a Core into a standalone CLI with local persistence and direct provider configuration.",
    changes: [
      "Removed server, shared, and database packages",
      "Added local session and config storage",
      "Added OpenAI/Codex and OpenRouter configuration",
      "Added npm onboarding, release notes, and update checking"
    ]
  },
  {
    version: "2.0.0",
    title: "Terminal AI Coding Assistant",
    description: "Full React-based TUI with three AI modes, OAuth login, project intelligence, and 18 built-in tools.",
    changes: [
      "Complete rewrite with OpenTUI React framework",
      "Three AI modes: BUILD, PLAN, and ULTRA",
      "OpenRouter OAuth PKCE login flow",
      "Project workspace indexing and memory system",
      "18 built-in tools for file operations, search, and shell commands",
      "32 dark themes with font size customization",
      "Local session persistence with history browsing",
      "In-app command palette (/commands)",
      "Auto-fallback model routing on failures",
      "Multi-file batch read/write/edit operations",
      "Sub-agent invocation for complex tasks (ULTRA mode)",
      "Affected test detection and strategy generation"
    ]
  }
];

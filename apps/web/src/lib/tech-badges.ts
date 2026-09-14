// Real GitHub-linguist colors for every language `languageFor()` in
// repository-analysis.ts can produce, so the bar reads the same as a
// developer already expects from GitHub's own language breakdown.
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C#": "#178600",
  C: "#555555",
  "C++": "#f34b7d",
  Swift: "#F05138",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Shell: "#89e051",
  SQL: "#e38c00",
  Dart: "#00B4AB",
  Other: "#8b8b8b",
};
export function colorFor(name: string) {
  return LANGUAGE_COLORS[name] ?? LANGUAGE_COLORS.Other;
}

// Every tool string `summarize()` can actually emit (repository-analysis.ts),
// grouped so "detected tools" reads as categories instead of one flat pile.
export const TOOL_CATEGORIES: Record<string, string> = {
  "Next.js": "Frameworks",
  React: "Frameworks",
  Vue: "Frameworks",
  Svelte: "Frameworks",
  Vite: "Frameworks",
  Express: "Frameworks",
  FastAPI: "Frameworks",
  Django: "Frameworks",
  Flask: "Frameworks",
  TypeScript: "Frameworks",
  Prisma: "Data",
  PostgreSQL: "Data",
  "Tailwind CSS": "Styling",
  Docker: "Infrastructure",
  Terraform: "Infrastructure",
  "GitHub Actions": "Infrastructure",
  "AWS SDK": "Infrastructure",
};
export const TOOL_CATEGORY_ORDER = [
  "Frameworks",
  "Data",
  "Styling",
  "Infrastructure",
  "Other",
];
export function categoryFor(tool: string) {
  return TOOL_CATEGORIES[tool] ?? "Other";
}

// Real simple-icons slugs (shields.io `logo=` param), only for tools/languages
// already listed above — never guessed for anything outside this set.
export const SIMPLE_ICON_SLUGS: Record<string, string> = {
  "Next.js": "nextdotjs",
  React: "react",
  Vue: "vuedotjs",
  Svelte: "svelte",
  Vite: "vite",
  Express: "express",
  FastAPI: "fastapi",
  Django: "django",
  Flask: "flask",
  TypeScript: "typescript",
  JavaScript: "javascript",
  Prisma: "prisma",
  PostgreSQL: "postgresql",
  "Tailwind CSS": "tailwindcss",
  Docker: "docker",
  Terraform: "terraform",
  "GitHub Actions": "githubactions",
  "AWS SDK": "amazonaws",
  Python: "python",
  Go: "go",
  Rust: "rust",
  Java: "openjdk",
  Kotlin: "kotlin",
  Ruby: "ruby",
  PHP: "php",
  "C#": "csharp",
  "C++": "cplusplus",
  Swift: "swift",
  HTML: "html5",
  CSS: "css3",
  Shell: "gnubash",
  SQL: "postgresql",
  Dart: "dart",
};

function shieldEncode(value: string) {
  return encodeURIComponent(value).replace(/-/g, "--").replace(/_/g, "__");
}

export function badgeUrl(
  label: string,
  value: string,
  color: string,
  logo?: string,
) {
  const url = new URL(
    `https://img.shields.io/badge/${shieldEncode(label)}${value ? `-${shieldEncode(value)}` : ''}-${color.replace(/^#/, "")}`,
  );
  url.searchParams.set("style", "flat-square");
  if (logo) {
    url.searchParams.set("logo", logo);
    url.searchParams.set("logoColor", "white");
  }
  return url.toString();
}

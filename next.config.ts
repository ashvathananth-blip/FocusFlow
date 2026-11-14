import type { NextConfig } from "next";

// The installed Tailwind package exposes a standard webpack loader. Append it
// to Next's existing CSS chain; a new top-level CSS rule disables built-in CSS
// extraction. Keep the existing Turbopack rule for development/diagnosis.
function addTailwindToCssRules(rules: unknown[]) {
  for (const item of rules) {
    if (!item || typeof item !== "object") continue;
    const rule = item as { oneOf?: unknown[]; rules?: unknown[]; use?: unknown[] };
    if (Array.isArray(rule.oneOf)) addTailwindToCssRules(rule.oneOf);
    if (Array.isArray(rule.rules)) addTailwindToCssRules(rule.rules);
    if (!Array.isArray(rule.use)) continue;
    const loaders = rule.use.map(entry => typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as {loader?: string}).loader ?? "" : "");
    if (loaders.some(loader => loader.includes("postcss-loader")) && !loaders.some(loader => loader.includes("@tailwindcss/turbopack"))) {
      rule.use.push({ loader: "@tailwindcss/turbopack" });
    }
  }
}
const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  webpack(config) {
    addTailwindToCssRules(config.module.rules);
    return config;
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

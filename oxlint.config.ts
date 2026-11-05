import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

const effectHooks = {
  importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"],
  message:
    "Derive in render, act in the event handler, or subscribe with useSyncExternalStore / an @effect/atom-react atom.",
  name: "react",
};

export default defineConfig({
  extends: [core, react, antiSlop],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "brand/**",
    ".github/actions/**",
    "tools/oxlint/anti-slop-effect/**",
    "apps/web/convex/_generated/**",
    "packages/autofork/dist/**",
  ],
  jsPlugins: [
    { name: "no-comments", specifier: "./tools/oxlint/no-comments.ts" },
    { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop-effect/index.ts" },
  ],
  options: { reportUnusedDisableDirectives: "error", typeAware: true },
  rules: {
    "import/no-cycle": "error",
    "eslint/max-classes-per-file": "off",
    "eslint/sort-keys": "off",
    "no-comments/no-comments": "error",
    "no-restricted-imports": ["error", { paths: [effectHooks] }],
    "oxc/no-accumulating-spread": "error",
  },
  overrides: [
    {
      files: ["apps/web/**"],
      rules: {
        "anti-slop-effect/no-manual-effect-error-tag": "error",
        "anti-slop-effect/no-manual-tag-comparison": "error",
        "anti-slop-effect/no-manual-tagged-construction": "error",
        "anti-slop-effect/no-service-constructor-imports": "error",
        "anti-slop-effect/prefer-effect-match": "error",
        "eslint/no-redeclare": "off",
        "unicorn/throw-new-error": "off",
      },
    },
  ],
});

import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

const effectHooks = {
  name: "react",
  importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"],
  message:
    "Derive in render, act in the event handler, or subscribe with useSyncExternalStore / an @effect/atom-react atom.",
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
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  rules: {
    "no-comments/no-comments": "error",
    "oxc/no-accumulating-spread": "error",
    "import/no-cycle": "error",
    "no-restricted-imports": ["error", { paths: [effectHooks] }],
    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/prefer-effect-match": "error",
  },
});

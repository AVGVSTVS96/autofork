import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode, Suspense } from "react";
import { prerender } from "react-dom/static";

import { appRouter } from "./router.tsx";

export const render = async (path: string) => {
  const router = appRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();

  // The browser's RouterProvider wraps routes in a Suspense it skips on the server; this one gives hydration its markers: https://github.com/TanStack/router/blob/main/packages/react-router/src/Matches.tsx
  const { prelude } = await prerender(
    <StrictMode>
      <Suspense>
        <RouterProvider router={router} />
      </Suspense>
    </StrictMode>,
  );

  return await new Response(prelude).text();
};

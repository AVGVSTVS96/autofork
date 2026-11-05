import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { appRouter } from "./router.tsx";

import "./style.css";

const router = appRouter(createBrowserHistory());

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

const root = document.querySelector("#root");

if (root?.hasChildNodes() === true) {
  void router.load().then(() => hydrateRoot(root, app));
} else if (root) {
  createRoot(root).render(app);
}

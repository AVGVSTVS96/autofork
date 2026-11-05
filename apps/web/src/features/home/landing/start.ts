import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";

import { gitGraph } from "./graph.ts";
import { lineage } from "./lineage.ts";
import { releasesInTurn } from "./story.ts";

export const start = (page: HTMLElement | null) => {
  if (page === null) {
    return constVoid;
  }

  const t3 = Effect.runFork(
    Effect.promise(async () => await import("./t3.ts")).pipe(
      Effect.andThen(({ mount }) =>
        Effect.sync(() => {
          mount(page.querySelector("[data-t3]"));
        }),
      ),
    ),
  );

  const stops = [
    gitGraph(page),
    releasesInTurn(page.querySelector("[data-story]")),
    lineage(page.querySelector("[data-lineage]")),
  ];

  return () => {
    t3.interruptUnsafe();

    for (const stop of stops) {
      stop();
    }
  };
};

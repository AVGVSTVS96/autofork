import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import { constVoid } from "effect/Function";

import { still } from "./draw.ts";

const wide = () => matchMedia("(min-width: 861px)").matches;

export const releasesInTurn = (root: HTMLElement | null) => {
  const fill = root?.querySelector(".wire .fill");

  if (root === null || !(fill instanceof HTMLElement)) {
    return constVoid;
  }

  const rels = [...root.querySelectorAll<HTMLElement>(".rel")];

  const showAll = () => {
    for (const rel of rels) {
      rel.classList.add("played", "on");
    }
  };

  if (still()) {
    showAll();

    return constVoid;
  }

  const reset = () => {
    for (const rel of rels) {
      rel.classList.remove("playing", "played", "seen", "on");
    }

    fill.style.width = "0px";
    root.getBoundingClientRect();
  };

  const play = (rel: HTMLElement, i: number) =>
    Effect.gen(function* playing() {
      for (const [j, other] of rels.entries()) {
        other.classList.toggle("on", j === i);
      }

      rel.classList.add("playing", "played");
      const tag = rel.querySelector<HTMLElement>(".tag");
      fill.style.width = `${rel.offsetLeft + (tag?.offsetWidth ?? 0)}px`;
      yield* Effect.sleep(i === 0 ? "2600 millis" : "3800 millis");
      rel.classList.remove("playing");
      rel.classList.add("seen");
    });

  const tell = Effect.sync(reset).pipe(
    Effect.andThen(
      Effect.forever(
        Effect.all(rels.map(play), { discard: true }).pipe(
          Effect.andThen(Effect.sleep("2200 millis")),
          Effect.andThen(Effect.sync(reset)),
          Effect.andThen(Effect.sleep("900 millis")),
        ),
      ),
    ),
  );

  let telling: Fiber.Fiber<never> | undefined;

  const stop = () => {
    telling?.interruptUnsafe();
    telling = undefined;
  };

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!wide()) {
          if (entry.isIntersecting) {
            showAll();
          }
        } else if (entry.isIntersecting) {
          telling ??= Effect.runFork(tell);
        } else {
          stop();
        }
      }
    },
    { threshold: 0.45 },
  );

  seen.observe(root);

  return () => {
    seen.disconnect();
    stop();
  };
};

import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
import { useCallback, useRef } from "react";

export interface Example {
  app: string;
  avatar: string;
  change: string;
}

export const sentence = (example: Example) => `${example.app}, but ${example.change}`;

const ROW = 32;
const BADGE_PADDING = 17;
const PASSED_BY = 4;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const escape = (text: string) => text.replaceAll(/[&<>"]/gu, (c) => `&#${c.codePointAt(0) ?? 0};`);

const firstReelItem = (example: Example) =>
  `<span><img src="${escape(example.avatar)}" alt="">${escape(example.app)}</span>`;

const reelItem = (example: Example) => {
  const span = document.createElement("span");
  const icon = document.createElement("img");
  icon.src = example.avatar;
  icon.alt = "";
  span.append(icon, example.app);

  return span;
};

interface Parts {
  box: HTMLElement;
  chip: HTMLElement;
  strip: HTMLElement;
  text: HTMLElement;
}

const animate = (
  { box, chip, strip, text }: Parts,
  examples: readonly Example[],
  current: { index: number },
  onLand: (index: number) => void,
) => {
  const at = (index: number) => examples[index] ?? examples[0];

  const fit = () => {
    const last = strip.lastElementChild;
    chip.style.width = `${(last instanceof HTMLElement ? last.offsetWidth : 0) + BADGE_PADDING}px`;
  };

  const land = (index: number) => {
    const example = at(index);
    strip.style.transition = "none";
    strip.style.transform = "none";
    strip.replaceChildren(...(example === undefined ? [] : [reelItem(example)]));
    current.index = index;
    onLand(index);
    fit();
  };

  const roll = (to: number) =>
    Effect.gen(function* rolling() {
      const passing = examples
        .flatMap((_, i) => (i === current.index || i === to ? [] : [i]))
        .toSorted(() => Math.random() - 0.5)
        .slice(0, PASSED_BY);

      const items = [current.index, ...passing, to].flatMap((i) => {
        const example = at(i);

        return example === undefined ? [] : [reelItem(example)];
      });

      strip.replaceChildren(...items);
      strip.getBoundingClientRect();
      strip.style.transition = "transform 900ms cubic-bezier(.25,.75,.2,1)";
      strip.style.transform = `translateY(${-(items.length - 1) * ROW}px)`;
      fit();
      yield* Effect.sleep("920 millis");
      land(to);
    });

  const typing = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.sync(() => {
      box.classList.add("typing");
    }).pipe(
      Effect.andThen(effect),
      Effect.ensuring(
        Effect.sync(() => {
          box.classList.remove("typing");
        }),
      ),
    );

  const type = (line: string) =>
    typing(
      Effect.all(
        Array.from({ length: line.length }, (_, i) => i + 1).map((shown) =>
          Effect.sync(() => {
            text.textContent = line.slice(0, shown);
          }).pipe(
            Effect.andThen(Effect.sleep(line[shown - 1] === " " ? 70 : 28 + Math.random() * 38)),
          ),
        ),
        { discard: true },
      ),
    );

  const erase = typing(
    Effect.whileLoop({
      while: () => text.textContent !== "",
      body: () =>
        Effect.sync(() => {
          text.textContent = text.textContent.slice(0, -2);
        }).pipe(Effect.andThen(Effect.sleep("14 millis"))),
      step: constVoid,
    }),
  );

  const change = () => `but ${at(current.index)?.change ?? ""}`;

  const cycle = Effect.gen(function* cycling() {
    yield* type(change());
    yield* Effect.sleep("2600 millis");
    yield* erase;
    yield* roll((current.index + 1) % examples.length);
    yield* Effect.sleep("160 millis");
  });

  const play = Effect.suspend(() => {
    if (still()) {
      text.textContent = change();

      return Effect.void;
    }

    text.textContent = "";

    return Effect.sleep("700 millis").pipe(Effect.andThen(Effect.forever(cycle)));
  });

  const fitOnFonts = Effect.promise(async () => await document.fonts.ready).pipe(
    Effect.andThen(Effect.sync(fit)),
  );

  return { fit, land, play, fitOnFonts };
};

export const Typer = ({
  examples,
  live,
  onLand,
}: {
  examples: readonly Example[];
  live: boolean;
  onLand: (index: number) => void;
}) => {
  const badge = useRef<HTMLSpanElement>(null);
  const reel = useRef<HTMLSpanElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const current = useRef({ index: 0 });

  const run = useCallback(
    (box: HTMLSpanElement | null) => {
      const chip = badge.current;
      const strip = reel.current;
      const text = typed.current;

      if (box === null || chip === null || strip === null || text === null) {
        return constVoid;
      }

      const typer = animate({ box, chip, strip, text }, examples, current.current, onLand);
      typer.fit();

      const fiber = Effect.runFork(
        Effect.all([typer.fitOnFonts, live ? typer.play : Effect.void], { concurrency: 2 }),
      );

      return () => {
        fiber.interruptUnsafe();
        box.classList.remove("typing");
        typer.land(current.current.index);
      };
    },
    [examples, live, onLand],
  );

  const [first] = examples;

  return (
    <span ref={run} className={live ? "typer live" : "typer"} aria-hidden="true">
      <span ref={badge} className="badge">
        <span
          ref={reel}
          className="reel"
          // oxlint-disable-next-line react/no-danger -- the typer swaps the reel's items itself, so React must not own them; it renders the first as HTML so the prerendered page shows it
          dangerouslySetInnerHTML={{ __html: first === undefined ? "" : firstReelItem(first) }}
        />
      </span>
      <span className="typed-line">
        <span ref={typed} className="typed" />
        <i className="caret" />
      </span>
    </span>
  );
};

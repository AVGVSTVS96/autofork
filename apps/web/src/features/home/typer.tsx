import { useEffect, useRef } from "react";

export interface Example {
  app: string;
  avatar: string;
  change: string;
}

export const sentence = (example: Example) => `${example.app}, but ${example.change}`;

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const escape = (text: string) => text.replaceAll(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/* The reel's items are HTML the typer swaps in itself; React only puts the first one there, so the prerendered page shows it */
const reelItem = (example: Example) =>
  `<span><img src="${escape(example.avatar)}" alt="">${escape(example.app)}</span>`;

export const Typer = ({
  examples,
  live,
  onLand,
}: {
  examples: readonly Example[];
  live: boolean;
  onLand: (index: number) => void;
}) => {
  const root = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const reel = useRef<HTMLSpanElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const current = useRef(0);

  useEffect(() => {
    const box = root.current!;
    const chip = badge.current!;
    const strip = reel.current!;
    const text = typed.current!;
    let on = live;

    const item = (example: Example) => {
      const span = document.createElement("span");
      span.innerHTML = reelItem(example);

      return span.firstElementChild!;
    };

    const fit = () => {
      chip.style.width = `${(strip.lastElementChild as HTMLElement).offsetWidth + 17}px`;
    };

    const land = (index: number) => {
      strip.style.transition = "none";
      strip.style.transform = "none";
      strip.replaceChildren(item(examples[index]!));
      current.current = index;
      onLand(index);
      fit();
    };

    const roll = async (to: number) => {
      const pass = examples
        .map((_, i) => i)
        .filter((i) => i !== current.current && i !== to)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);

      const items = [current.current, ...pass, to];
      strip.replaceChildren(...items.map((i) => item(examples[i]!)));
      strip.getBoundingClientRect();
      strip.style.transition = "transform 900ms cubic-bezier(.25,.75,.2,1)";
      strip.style.transform = `translateY(${-(items.length - 1) * 32}px)`;
      fit();
      await wait(920);

      if (on) {
        land(to);
      }
    };

    const type = async (line: string) => {
      box.classList.add("typing");

      for (let i = 1; i <= line.length && on; i++) {
        text.textContent = line.slice(0, i);
        await wait(line[i - 1] === " " ? 70 : 28 + Math.random() * 38);
      }

      box.classList.remove("typing");
    };

    const erase = async () => {
      box.classList.add("typing");

      while (text.textContent && on) {
        text.textContent = text.textContent.slice(0, -2);
        await wait(14);
      }

      box.classList.remove("typing");
    };

    const play = async () => {
      const change = () => `but ${examples[current.current]!.change}`;

      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return void (text.textContent = change());
      }

      text.textContent = "";
      await wait(700);

      while (on) {
        await type(change());
        await wait(2600);

        if (!on) {
          return;
        }

        await erase();

        if (!on) {
          return;
        }

        await roll((current.current + 1) % examples.length);
        await wait(160);
      }
    };

    fit();
    void document.fonts.ready.then(fit);

    if (on) {
      void play();
    }

    return () => {
      on = false;
      box.classList.remove("typing");
      land(current.current);
    };
  }, [live]);

  return (
    <span ref={root} className={live ? "typer live" : "typer"} aria-hidden="true">
      <span ref={badge} className="badge">
        <span
          ref={reel}
          className="reel"
          dangerouslySetInnerHTML={{ __html: reelItem(examples[0]!) }}
        />
      </span>
      <span className="typed-line">
        <span ref={typed} className="typed" />
        <i className="caret" />
      </span>
    </span>
  );
};

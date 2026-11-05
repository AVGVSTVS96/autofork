import { constVoid } from "effect/Function";

import { front, still, svgEl } from "./draw.ts";

const WIDE = 1000;

const MAIN = [
  { name: "pi-patcher", when: "May", at: 0.03, end: false },
  { name: "PATCH.md", when: "June", at: 0.22, end: false },
  { name: "autofork", when: "October", at: 0.97, end: true },
];

const EXPERIMENTS = [
  { name: "herdr", when: "July", at: 0.44 },
  { name: "Claude Code plugins", when: "Oct 4", at: 0.6 },
  { name: "Buzz", when: "Oct 6", at: 0.73 },
  { name: "T3 Code", when: "Oct 10", at: 0.84 },
];

interface Post {
  card: HTMLElement;
  at: number;
}

interface Row {
  name: string;
  when: string;
  at: number;
  lane: number;
  end: boolean;
  card: HTMLElement | null;
}

interface Line {
  el: SVGPathElement;
  from: number;
  to: number;
}

interface Mark {
  el: Element;
  y: number;
}

const label = (
  parent: Element,
  {
    x,
    y,
    text,
    cls = "",
    anchor = "start",
  }: { x: number; y: number; text: string; cls?: string; anchor?: string },
) => {
  const t = svgEl(parent, "text", { x, y, class: cls, "text-anchor": anchor });
  t.textContent = text;

  return t;
};

const drawWide = (
  s: SVGSVGElement,
  {
    width,
    posts,
    top,
    linked,
  }: { width: number; posts: Post[]; top: number; linked: (name: string) => Element },
) => {
  const experimental = 190;
  const height = 260;
  const main = 104;
  s.setAttribute("viewBox", `0 0 ${width} ${height}`);
  s.setAttribute("height", String(height));
  const x = (f: number) => 8 + f * (width - 16);
  const out = x(0.31);
  const back = x(0.92);

  for (const { card, at } of posts) {
    const from = card.offsetLeft + card.offsetWidth / 2;
    const y0 = card.offsetTop + card.offsetHeight - top;
    const m = (y0 + main) / 2;
    svgEl(s, "path", {
      class: "say",
      d: `M${from} ${y0}C${from} ${m} ${x(at)} ${m} ${x(at)} ${main}`,
    });
  }

  svgEl(s, "path", { class: "main", d: `M${x(0)} ${main}H${x(1)}` });
  svgEl(s, "path", {
    class: "exp",
    d: `M${out} ${main}C${out + 40} ${main} ${out + 40} ${experimental} ${out + 80} ${experimental}H${back - 80}C${back - 40} ${experimental} ${back - 40} ${main} ${back} ${main}`,
  });
  label(s, { x: out + 84, y: experimental - 16, text: "experimental forks", cls: "group" });

  for (const m of MAIN) {
    const anchor = m.end ? "end" : "start";
    const lx = m.end ? x(m.at) + 8 : x(m.at) - 8;
    svgEl(s, "circle", { class: m.end ? "n end" : "n", cx: x(m.at), cy: main, r: m.end ? 9 : 7 });
    label(linked(m.name), { x: lx, y: main - 22, text: m.name, anchor });
    label(s, { x: lx, y: main + 32, text: m.when, cls: "when", anchor });
  }

  for (const { at } of posts) {
    svgEl(s, "circle", { class: "p", cx: x(at), cy: main, r: 4.5 });
  }

  for (const e of EXPERIMENTS) {
    svgEl(s, "circle", { class: "e", cx: x(e.at), cy: experimental, r: 6 });
    label(s, { x: x(e.at), y: experimental + 28, text: e.name, cls: "small", anchor: "middle" });
    label(s, { x: x(e.at), y: experimental + 46, text: e.when, cls: "when", anchor: "middle" });
  }
};

const rowsOf = (posts: Post[]): Row[] => {
  const [piPatcher, patchMd, autofork] = MAIN.map((m) => ({ ...m, lane: 0, card: null }));

  const middle = [
    ...EXPERIMENTS.map((e) => ({ ...e, lane: 1, end: false, card: null })),
    ...posts.map((p) => ({ name: "", when: "", at: p.at, lane: 0, end: false, card: p.card })),
  ].toSorted((a, b) => a.at - b.at);

  return [piPatcher, patchMd, ...middle, autofork].filter((row) => row !== undefined);
};

const nodeClass = (row: Row) => {
  if (row.lane === 1) {
    return "e";
  }

  return row.end ? "n end" : "n";
};

const drawNarrow = (
  s: SVGSVGElement,
  {
    width,
    posts,
    cards,
    linked,
  }: { width: number; posts: Post[]; cards: HTMLElement[]; linked: (name: string) => Element },
) => {
  const side = 40;
  const trunkX = 7;
  const lead = 22;
  const step = 58;
  const rows = rowsOf(posts);
  const ys: number[] = [];
  let y = 16;

  for (const row of rows) {
    ys.push(y);

    if (row.card === null) {
      y += step;
    } else {
      row.card.style.top = `${y - lead}px`;
      y += row.card.offsetHeight - lead + 36;
    }
  }

  const first = ys.at(0) ?? 0;
  const last = ys.at(-1) ?? 0;
  const height = last + 10;
  s.setAttribute("viewBox", `0 0 ${width} ${height}`);
  s.setAttribute("height", String(height));
  const out = (ys.at(1) ?? 0) + 24;
  const back = last - 24;
  const trunk = svgEl(s, "path", { class: "main", d: `M${trunkX} ${first}V${last}` });

  const branch = svgEl(s, "path", {
    class: "exp",
    d: `M${trunkX} ${out}C${trunkX} ${out + 17} ${side} ${out + 17} ${side} ${out + 34}V${back - 34}C${side} ${back - 17} ${trunkX} ${back - 17} ${trunkX} ${back}`,
  });

  for (const [i, row] of rows.entries()) {
    const rowY = ys[i] ?? 0;

    if (row.card !== null) {
      svgEl(s, "circle", { class: "p", cx: trunkX, cy: rowY, r: 4.5 });
      continue;
    }

    const cx = row.lane === 1 ? side : trunkX;
    svgEl(s, "circle", { class: nodeClass(row), cx, cy: rowY, r: row.lane === 1 ? 6 : 7 });
    label(row.lane === 1 ? s : linked(row.name), {
      x: cx + 20,
      y: rowY + 5,
      text: row.name,
      cls: row.lane === 1 ? "small" : "",
    });
    label(s, { x: width - 2, y: rowY + 5, text: row.when, cls: "when", anchor: "end" });
  }

  const lines: Line[] = [
    { el: trunk, from: first, to: last },
    { el: branch, from: out, to: back },
  ];

  const marks: Mark[] = [
    ...[...s.querySelectorAll("circle, text")].map((el) => ({
      el,
      y: Number(el.getAttribute("cy") ?? el.getAttribute("y")),
    })),
    ...cards.map((el) => ({ el, y: el.offsetTop + lead })),
  ];

  return { lines, marks };
};

export const lineage = (root: HTMLElement | null) => {
  if (root === null) {
    return constVoid;
  }

  const links = new Map([
    ["pi-patcher", root.dataset.pi],
    ["PATCH.md", root.dataset.patchmd],
  ]);

  const cards = [...root.querySelectorAll<HTMLElement>(".posts li")];
  const posts = cards.map((card) => ({ card, at: Number(card.dataset.at) }));
  let drawn: Element | undefined;
  let lines: Line[] = [];
  let marks: Mark[] = [];
  let seen = false;

  const reveal = () => {
    if (drawn === undefined || root.classList.contains("wide") || still()) {
      return;
    }

    const edge = front() - drawn.getBoundingClientRect().top;

    for (const line of lines) {
      line.el.style.strokeDashoffset = String(
        1 - Math.max(0, Math.min(1, (edge - line.from) / (line.to - line.from))),
      );
    }

    for (const mark of marks) {
      if (mark.y < edge) {
        mark.el.classList.add("in");
      }
    }
  };

  const draw = () => {
    const width = root.clientWidth;
    const wide = width >= WIDE;
    root.classList.toggle("wide", wide);

    for (const card of cards) {
      card.style.top = "";
    }

    drawn?.remove();
    lines = [];
    marks = [];
    const s = svgEl(root, "svg", { role: "img", "aria-label": root.dataset.label ?? "" });
    drawn = s;

    const linked = (name: string) => {
      const href = links.get(name);

      return href === undefined || href === "" ? s : svgEl(s, "a", { href });
    };

    if (wide) {
      const list = cards[0]?.parentElement;
      const top = list ? list.offsetTop + list.offsetHeight : 0;
      drawWide(s, { width, posts, top, linked });
    } else {
      ({ lines, marks } = drawNarrow(s, { width, posts, cards, linked }));
    }

    for (const path of s.querySelectorAll("path")) {
      path.setAttribute("pathLength", "1");
    }

    for (const [i, circle] of [...s.querySelectorAll("circle")].entries()) {
      circle.style.setProperty("--r", `${circle.getAttribute("r")}px`);
      circle.style.setProperty("--d", wide ? `${300 + i * 140}ms` : "0ms");
    }

    for (const [i, card] of cards.entries()) {
      card.style.setProperty("--d", wide ? `${500 + i * 160}ms` : "0ms");
    }

    if (wide && seen) {
      root.classList.add("in");
    }

    reveal();
  };

  const sized = new ResizeObserver(draw);

  for (const el of [root, ...cards]) {
    sized.observe(el);
  }

  if (still()) {
    root.classList.add("in");

    return () => {
      sized.disconnect();
    };
  }

  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      seen = true;

      if (root.classList.contains("wide")) {
        root.classList.add("in");
      }
    },
    { rootMargin: "0px 0px -35% 0px" },
  );

  watch.observe(root);

  const scrolled = () => {
    requestAnimationFrame(reveal);
  };

  addEventListener("scroll", scrolled, { passive: true });

  return () => {
    sized.disconnect();
    watch.disconnect();
    removeEventListener("scroll", scrolled);
  };
};

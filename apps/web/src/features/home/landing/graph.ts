import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";

import { front, px, removeAll, still, svgEl } from "./draw.ts";

const VERSIONS = ["v0.0.41", "v0.0.42", "v0.0.43", "v0.0.44", "v0.0.45", "v0.0.46"];
const DOT_GAPS = [62, 38, 94, 54, 120, 46, 78, 140, 58];

const narrow = () => matchMedia("(max-width: 600px)").matches;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NOWHERE: Box = { x: 0, y: 0, w: 0, h: 0 };

interface Timed {
  el: Element;
  y: number;
}

interface Lane {
  el: SVGPathElement;
  from: number;
  len: number;
}

const bend = (x0: number, y0: number, x1: number, y1: number) => {
  const m = (y0 + y1) / 2;

  return `M${x0} ${y0}C${x0} ${m} ${x1} ${m} ${x1} ${y1}`;
};

const canvas = (page: HTMLElement, svg: SVGSVGElement, timed: Timed[], lanes: Lane[]) => {
  const box = page.getBoundingClientRect();

  const at = (el: Element | null): Box => {
    if (el === null) {
      return NOWHERE;
    }

    const r = el.getBoundingClientRect();

    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };

  const one = (selector: string) => at(page.querySelector(selector));
  const defs = svgEl(svg, "defs", {});

  const mask = svgEl(defs, "mask", {
    id: "graph-shown",
    maskUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
  });

  const art = svgEl(svg, "g", { mask: "url(#graph-shown)" });

  const shown = (from: number, to: number, fadeIn: number, fadeOut = 0) => {
    const id = `graph-fade-${mask.childElementCount}`;
    const fade = svgEl(defs, "linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    const h = to - from;

    for (const [offset, opacity] of [
      [0, 0],
      [fadeIn / h, 1],
      [1 - fadeOut / h, 1],
      [1, fadeOut === 0 ? 1 : 0],
    ] as const) {
      svgEl(fade, "stop", { offset, "stop-color": "#fff", "stop-opacity": opacity });
    }

    svgEl(mask, "rect", { x: 0, y: from, width: box.width, height: h, fill: `url(#${id})` });
  };

  const later = (el: SVGGraphicsElement, y: number) => {
    if (el instanceof SVGPathElement) {
      el.classList.add("draw");
      el.style.setProperty("--len", String(el.getTotalLength()));
    } else if (el instanceof SVGCircleElement) {
      el.classList.add("dot-in");
      el.style.setProperty("--r", `${el.getAttribute("r")}px`);
    } else {
      el.classList.add("grow-in");
    }

    timed.push({ el, y });

    return el;
  };

  const lane = (cls: string, x: number, from: number, to: number) => {
    const path = svgEl(art, "path", { class: cls, d: `M${x} ${from}V${to}` });
    lanes.push({ el: path, from, len: path.getTotalLength() });
  };

  const path = (cls: string, d: string) => svgEl(art, "path", { class: cls, d });

  const dot = (cls: string, x: number, y: number, r: number) =>
    svgEl(art, "circle", { class: cls, cx: x, cy: y, r });

  const release = (x: number, y: number, i: number, side: "left" | "right") => {
    later(dot("rr", x, y, 7), y);
    const tag = document.createElement("span");
    tag.className = `graph-tag ${side}`;
    tag.ariaHidden = "true";
    tag.textContent = VERSIONS[i] ?? "";
    page.append(tag);
    const left = side === "left" ? x - 14 : x + 14;

    if (side === "left" && left - tag.offsetWidth < 4) {
      tag.remove();

      return;
    }

    Object.assign(tag.style, { top: `${y}px`, left: `${left}px` });
    timed.push({ el: tag, y });
  };

  const reach = (x: number, y: number, to: number) => {
    const from = x + 9;
    const w = to - 12 - from;

    if (w >= 12) {
      later(
        svgEl(art, "rect", { class: "reach", x: from, y: y - 1, width: w, height: 2, rx: 1 }),
        y,
      );
    }

    later(dot("y", x, y, 7), y);
  };

  const mid = (el: Element | null) => {
    const r = at(el);
    const lineHeight = el === null ? 0 : px(getComputedStyle(el).lineHeight);
    const line = Number.isNaN(lineHeight) || lineHeight === 0 ? r.h : lineHeight;

    return { x: r.x, y: r.y + Math.min(line, r.h) * 0.55 };
  };

  return { at, one, mid, shown, later, lane, path, dot, release, reach };
};

type Canvas = ReturnType<typeof canvas>;

const sections = (page: HTMLElement) => [...page.querySelectorAll(".home > section")];

const inTheGaps = (
  page: HTMLElement,
  { at, one, shown, later, lane, path, dot, release }: Canvas,
) => {
  const pad = px(getComputedStyle(page).paddingLeft);
  const yours = pad + 7;
  const theirs = yours + 22;
  const head = one(".hero h1").y - 24;
  const split = head - 44;
  const fork = split - 44;
  const top = fork - 32;

  shown(top, head + 10, 20);
  lane("theirs", theirs, top, head);
  path("yours", `${bend(theirs, fork, yours, split)}V${head}`);
  later(dot("c", theirs, head, 3.5), head);
  release(theirs, fork, 0, "right");
  dot("head", yours, head, 8);

  let above = at(page.querySelector(".hero"));

  for (const [i, section] of sections(page).entries()) {
    const from = above.y + above.h + 18;
    const node = at(section.firstElementChild).y - 22;
    above = at(section);
    const out = from + 30;
    shown(from, node + 10, 26);
    lane("theirs", theirs, from, node);
    lane("yours", yours, from, node);
    later(path("merge", bend(theirs, out, yours, node)), out);
    release(theirs, out, i + 1, "right");
    later(dot("c", theirs, node, 3.5), node);
    later(dot("y", yours, node, 7), node);
  }
};

const downTheEdge = (
  page: HTMLElement,
  svg: SVGSVGElement,
  { at, one, mid, shown, later, lane, path, dot, release, reach }: Canvas,
) => {
  const pad = px(getComputedStyle(page).paddingLeft);
  const nav = one("nav");
  const railW = pad - nav.x;
  const theirs = nav.x + Math.min(30, railW * 0.28);
  const yours = pad - Math.min(38, Math.max(18, railW * 0.32));
  const fork = mid(page.querySelector("[data-fork]"));
  const you = mid(page.querySelector("[data-you]"));
  const ask = one(".hero .ask");
  const hero = one(".hero");
  const top = nav.y + nav.h + 6;
  const end = one("footer").y - 20;

  const nodes = sections(page).map((section) => ({
    x: at(section.firstElementChild).x,
    y: mid(section.querySelector("[data-node]")).y,
  }));

  const first = Math.max(top + 44, fork.y - 100);

  const rels = [
    ...(fork.y - first >= 48 ? [first] : []),
    hero.y + hero.h + 70,
    ...nodes.flatMap((node, i) => {
      const next = nodes[i + 1];

      return next === undefined ? [] : [(node.y + next.y) / 2 + 40];
    }),
  ];

  shown(top, end, 32, 72);
  lane("theirs", theirs, top, end);
  path("yours", bend(theirs, fork.y, yours, you.y));
  lane("yours", yours, you.y, end);

  const busy = [...rels, fork.y].map((y) => ({ from: y - 18, to: y + 18 }));

  for (let gaps = 0, y = top + 34; y < end - 10; gaps += 1) {
    const free = !busy.some(({ from, to }) => y > from && y < to);

    if (free) {
      later(dot("c", theirs, y, 3.5), y);
    }

    y += DOT_GAPS[gaps % DOT_GAPS.length] ?? 60;
  }

  for (const [i, y] of rels.slice(0, VERSIONS.length).entries()) {
    if (y > you.y + 10) {
      later(path("merge", bend(theirs, y, yours, y + 44)), y);
      later(dot("y", yours, y + 44, 5), y + 44);
    }

    release(theirs, y, i, "left");
  }

  dot("rr", theirs, fork.y, 7);
  dot("head", yours, you.y, 8);
  reach(yours, ask.y + ask.h / 2, ask.x);

  for (const node of nodes) {
    reach(yours, node.y, node.x);
  }

  const band = one(".yours-card");

  for (const circle of svg.querySelectorAll("circle")) {
    const x = Number(circle.getAttribute("cx"));
    const y = Number(circle.getAttribute("cy"));

    if (x > band.x && x < band.x + band.w && y > band.y && y < band.y + band.h) {
      circle.classList.add("on-band");
    }
  }
};

export const gitGraph = (page: HTMLElement) => {
  const svg = page.querySelector("svg.graph");

  if (!(svg instanceof SVGSVGElement)) {
    return constVoid;
  }

  let timed: Timed[] = [];
  let lanes: Lane[] = [];

  const grow = () => {
    const edge = scrollY + front() - (page.getBoundingClientRect().top + scrollY);

    for (const lane of lanes) {
      const shown = still() ? lane.len : Math.max(0, Math.min(lane.len, edge - lane.from));
      lane.el.style.strokeDasharray = `${lane.len}`;
      lane.el.style.strokeDashoffset = `${lane.len - shown}`;
    }

    for (const t of timed) {
      if (still() || t.y < edge) {
        t.el.classList.add("in");
      }
    }
  };

  const draw = () => {
    svg.replaceChildren();
    removeAll(page, ".graph-tag");
    timed = [];
    lanes = [];
    const kit = canvas(page, svg, timed, lanes);

    if (narrow()) {
      inTheGaps(page, kit);
    } else {
      downTheEdge(page, svg, kit);
    }

    grow();
  };

  let frame = 0;

  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };

  const scrolled = () => {
    requestAnimationFrame(grow);
  };

  const fonts = Effect.runFork(
    Effect.promise(async () => await document.fonts.ready).pipe(
      Effect.andThen(Effect.sync(redraw)),
    ),
  );

  const sized = new ResizeObserver(redraw);
  sized.observe(page);
  addEventListener("scroll", scrolled, { passive: true });

  return () => {
    fonts.interruptUnsafe();
    cancelAnimationFrame(frame);
    sized.disconnect();
    removeEventListener("scroll", scrolled);
    svg.replaceChildren();
    removeAll(page, ".graph-tag");
  };
};

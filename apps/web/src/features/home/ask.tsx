import { RegistryContext, useAtomSubscribe, useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import { useCallback, useContext, useId, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent, Ref, SubmitEvent } from "react";

import { split, squash } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { known } from "../../lib/repos/known.ts";
import { sentence, Typer } from "./typer.tsx";
import type { Example } from "./typer.tsx";

const CUT = /^(?<app>.+?)(?:\s*,\s*(?:but\s+)?|\s+but\s+|\s*:\s+)(?<change>.*)$/iu;
const BUT = /^but\s+/iu;
const GUESS_AFTER = "320 millis";
const WORDS_IN_AN_APP_NAME = 3;
const IDLE_AFTER_BLUR = 1400;

interface Guess {
  app: string;
  name: string;
  avatar: string;
}

export interface Face {
  name: string;
  avatar: string;
}

export interface Fill {
  app: string;
  change: string;
  face?: Face;
  keyboard: boolean;
}

export interface AskHandle {
  fill: (ask: Fill) => void;
}

const words = (text: string) => text.trim().split(/\s+/u).length;

const looksLike = (typed: string, name: string) => {
  const app = squash(typed);
  const repo = squash(name);

  return (repo.includes(app) && app.length >= repo.length * 0.6) || app.includes(repo);
};

const decoded = (src: string) =>
  Effect.tryPromise(async () => {
    const icon = new Image();
    icon.src = src;
    await icon.decode();
  }).pipe(Effect.ignore);

const recognized = Atom.family((app: string) =>
  Atom.make((get) =>
    Effect.gen(function* recognize() {
      yield* Effect.sleep(GUESS_AFTER);
      const { repo } = yield* get.result(client.resolve(app));

      if (!looksLike(app, repo.name)) {
        return Option.none<Guess>();
      }

      if (repo.avatar !== "") {
        yield* decoded(repo.avatar);
      }

      return Option.some<Guess>({ app, name: repo.name, avatar: repo.avatar });
    }),
  ),
);

const Recognize = ({ app, onFound }: { app: string; onFound: (guess: Guess) => void }) => {
  useAtomSubscribe(
    recognized(app),
    (result) => {
      if (AsyncResult.isSuccess(result) && Option.isSome(result.value)) {
        onFound(result.value.value);
      }
    },
    { immediate: true },
  );

  return null;
};

const Pick = ({ guess, onPick }: { guess: Guess; onPick: () => void }) => (
  <button
    type="button"
    className="pick"
    tabIndex={-1}
    onPointerDown={(event) => {
      event.preventDefault();
    }}
    onClick={onPick}
    title={`Fork ${guess.name}`}
  >
    {guess.avatar === "" ? null : <img src={guess.avatar} alt="" />}
    {guess.name}
    <kbd>tab</kbd>
  </button>
);

const Badge = ({
  name,
  avatar,
  onEdit,
}: {
  name: string;
  avatar: string | undefined;
  onEdit: () => void;
}) => (
  <button type="button" className="badge chip" onClick={onEdit} title="Change the app">
    {avatar === undefined || avatar === "" ? <i /> : <img src={avatar} alt="" />}
    {name}
  </button>
);

const Lookup = ({
  app,
  face,
  onEdit,
}: {
  app: string;
  face: Guess | undefined;
  onEdit: () => void;
}) => {
  const found = useAtomValue(client.resolve(app));
  const repo = AsyncResult.isSuccess(found) ? found.value.repo : undefined;

  return (
    <Badge
      name={repo?.name ?? face?.name ?? app}
      avatar={repo?.avatar ?? face?.avatar}
      onEdit={onEdit}
    />
  );
};

const Chip = ({
  app,
  face,
  onEdit,
}: {
  app: string;
  face: Guess | undefined;
  onEdit: () => void;
}) => {
  const ready = known(app);

  return ready === undefined ? (
    <Lookup app={app} face={face} onEdit={onEdit} />
  ) : (
    <Badge name={app} avatar={ready.repo.avatar} onEdit={onEdit} />
  );
};

const exampleFor = (typed: string, examples: readonly Example[]) =>
  typed.length >= 2 ? examples.find((one) => squash(one.app).startsWith(squash(typed))) : undefined;

const guessFor = (typed: string, examples: readonly Example[], found: Guess | undefined) => {
  const example = exampleFor(typed, examples);

  if (example !== undefined) {
    return { app: example.app, name: example.app, avatar: example.avatar };
  }

  return found?.app === typed ? found : undefined;
};

const hintFor = ({
  live,
  chipped,
  fallback,
}: {
  live: boolean;
  chipped: boolean;
  fallback: string;
}) => {
  if (live) {
    return "";
  }

  return chipped ? "but what you'd change" : fallback;
};

const submitter = (event: SubmitEvent<HTMLFormElement>) => {
  const button = event.nativeEvent.submitter;

  return button instanceof HTMLButtonElement && button.value !== "" ? button.value : undefined;
};

const finePointer = () => matchMedia("(pointer: fine)").matches;

const caretToEnd = (field: HTMLTextAreaElement) => {
  field.setSelectionRange(field.value.length, field.value.length);
};

export const Ask = ({
  ref,
  id,
  initial = "",
  onSubmit,
  label,
  action,
  examples,
}: {
  ref?: Ref<AskHandle>;
  id?: string;
  initial?: string;
  onSubmit: (ask: string, via: string | undefined) => void;
  label: string;
  action: string;
  examples: readonly Example[];
}) => {
  const start = split(initial);
  const [app, setApp] = useState(start.app);
  const [text, setText] = useState(start.change);
  const [current, setCurrent] = useState(0);
  const [idle, setIdle] = useState(true);
  const [found, setFound] = useState<Guess | undefined>(undefined);
  const [face, setFace] = useState<Guess | undefined>(undefined);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const arrival = useRef<() => void>(undefined);
  const registry = useContext(RegistryContext);
  const entry = useId();
  const live = idle && app === "" && text === "";
  const shown = examples.at(current);
  const fallback = shown === undefined ? "" : sentence(shown);
  const typed = app === "" ? text.trim() : "";

  const guess = guessFor(typed, examples, found);

  const guessing =
    typed !== "" &&
    exampleFor(typed, examples) === undefined &&
    words(typed) <= WORDS_IN_AN_APP_NAME &&
    known(typed) === undefined;

  const chip = (name: string, rest = "") => {
    setApp(name);
    setText(rest);
  };

  const type = (next: string) => {
    const cut = app === "" ? CUT.exec(next)?.groups : undefined;
    const named = cut?.app?.trim() ?? "";

    if (named === "") {
      setText(app !== "" && text === "" ? next.trimStart() : next);
    } else {
      chip(named, cut?.change);
    }
  };

  useImperativeHandle(ref, () => ({
    fill: ({ app: name, change, face: picked, keyboard }) => {
      const field = input.current;
      const form = field?.form;

      if (!field || !form) {
        return;
      }

      const land = () => {
        setFace(picked === undefined ? undefined : { app: name, ...picked });
        chip(name, change);

        if (!keyboard && !finePointer()) {
          return;
        }

        requestAnimationFrame(() => {
          field.focus({ preventScroll: true });
          caretToEnd(field);
        });
      };

      const { top, bottom } = form.getBoundingClientRect();

      if (arrival.current) {
        document.removeEventListener("scrollend", arrival.current);
      }

      arrival.current = undefined;

      if ((top >= 0 && bottom <= innerHeight) || !("onscrollend" in document)) {
        land();
      } else {
        arrival.current = land;
        document.addEventListener("scrollend", land, { once: true });
      }

      form.scrollIntoView({ block: "center" });
    },
  }));

  const unchip = () => {
    const rest = text.trim().replace(BUT, "");
    const back = rest === "" ? app : `${app}, but ${rest}`;
    setApp("");
    setText(back);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(app.length, app.length);
    });
  };

  const lead = (change: string) =>
    [found?.app, ...examples.map((one) => one.app)].find(
      (name) =>
        name !== undefined &&
        name !== "" &&
        change.toLowerCase().startsWith(`${name.toLowerCase()} `),
    );

  const asked = () => {
    const change = text.trim().replace(BUT, "");

    if (app !== "") {
      return change === "" ? app : `${app}, but ${change}`;
    }

    if (change === "") {
      return fallback;
    }

    const name = lead(change);

    return name === undefined
      ? change
      : `${name}, but ${change.slice(name.length).trim().replace(BUT, "")}`;
  };

  const hint = hintFor({ live, chipped: app !== "", fallback });

  const field = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      input.current = textarea;

      if (textarea !== null && initial !== "" && finePointer()) {
        textarea.focus();
        caretToEnd(textarea);
      }
    },
    [initial],
  );

  const prefetch = () => {
    const name = split(asked()).app;

    if (known(name) === undefined) {
      registry.mount(client.resolve(name))();
    }
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(asked(), submitter(event));
  };

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd, form } = event.currentTarget;

    if (event.key === "Backspace" && app !== "" && selectionStart === 0 && selectionEnd === 0) {
      event.preventDefault();
      unchip();

      return;
    }

    if (event.key === "Tab" && !event.shiftKey && guess) {
      event.preventDefault();
      chip(guess.app);

      return;
    }

    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (guess) {
      chip(guess.app);

      return;
    }

    if (typed !== "" && lead(typed) === undefined && words(typed) <= WORDS_IN_AN_APP_NAME) {
      chip(typed);

      return;
    }

    form?.requestSubmit();
  };

  return (
    <form className="ask" id={id} onSubmit={submit}>
      <label className="field slots" htmlFor={entry}>
        {app === "" ? null : (
          <Chip key={app} app={app} face={face?.app === app ? face : undefined} onEdit={unchip} />
        )}
        <span className="entry">
          <textarea
            id={entry}
            ref={field}
            rows={1}
            value={text}
            onChange={(event) => {
              type(event.target.value.replaceAll("\n", " "));
            }}
            onKeyDown={keys}
            onFocus={() => {
              clearTimeout(resume.current);
              setIdle(false);
            }}
            onBlur={() => {
              resume.current = setTimeout(() => {
                setIdle(true);
              }, IDLE_AFTER_BLUR);
            }}
            placeholder={hint}
            aria-label={app === "" ? label : `What you'd change in ${app}`}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mirror" aria-hidden="true">
            {text === "" ? hint : text}
            {guess ? (
              <Pick
                guess={guess}
                onPick={() => {
                  chip(guess.app);
                }}
              />
            ) : null}{" "}
          </span>
        </span>
        {guessing ? <Recognize key={typed} app={typed} onFound={setFound} /> : null}
        <Typer examples={examples} live={live} onLand={setCurrent} />
      </label>
      <button type="submit" onPointerEnter={prefetch} onPointerDown={prefetch} onFocus={prefetch}>
        {action}
      </button>
    </form>
  );
};

import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useContext, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { FormEvent, Ref } from "react";

import { split, squash } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { known } from "../../lib/repos/known.ts";
import { sentence, Typer } from "./typer.tsx";
import type { Example } from "./typer.tsx";

const CUT = /^(.+?)(?:\s*,\s*(?:but\s+)?|\s+but\s+|\s*:\s+)(.*)$/i;
const BUT = /^but\s+/i;

interface Guess {
  app: string;
  name: string;
  avatar: string | undefined;
}

export interface Face {
  name: string;
  avatar: string;
}

export interface AskHandle {
  fill: (ask: { app: string; change: string; face?: Face; keyboard: boolean }) => void;
}

const words = (text: string) => text.trim().split(/\s+/).length;

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
  onSubmit: (ask: string, via?: string) => void;
  label: string;
  action: string;
  examples: readonly Example[];
}) => {
  const start = split(initial);
  const [app, setApp] = useState(start.app);
  const [text, setText] = useState(start.change);
  const [current, setCurrent] = useState(0);
  const [idle, setIdle] = useState(true);
  const [asking, setAsking] = useState("");
  const [found, setFound] = useState<Guess | undefined>(undefined);
  const [face, setFace] = useState<Guess | undefined>(undefined);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const arrival = useRef<() => void>(undefined);
  const live = idle && !app && !text;
  const fallback = sentence(examples[current]!);
  const typed = app ? "" : text.trim();

  const example =
    typed.length >= 2
      ? examples.find((one) => squash(one.app).startsWith(squash(typed)))
      : undefined;

  const guess: Guess | undefined = example
    ? { app: example.app, name: example.app, avatar: example.avatar }
    : found?.app === typed
      ? found
      : undefined;

  useEffect(() => {
    if (!typed || example || words(typed) > 3) {
      setAsking("");

      return;
    }

    const later = setTimeout(() => {
      setAsking(typed);
    }, 320);

    return () => {
      clearTimeout(later);
    };
  }, [typed, example]);

  const chip = (name: string, rest = "") => {
    setApp(name);
    setText(rest);
  };

  const type = (next: string) => {
    const cut = app ? null : CUT.exec(next);

    if (cut && cut[1]!.trim()) {
      chip(cut[1]!.trim(), cut[2]);
    } else {
      setText(app && !text ? next.trimStart() : next);
    }
  };

  /* An ask picked elsewhere on the page: the composer comes into view, and the ask lands in it once the scroll settles, so you see it arrive */
  useImperativeHandle(ref, () => ({
    fill: ({ app: name, change, face: picked, keyboard }) => {
      const field = input.current!;
      const form = field.form!;

      const land = () => {
        setFace(picked && { app: name, ...picked });
        chip(name, change);

        if (!keyboard && !matchMedia("(pointer: fine)").matches) {
          return;
        }

        requestAnimationFrame(() => {
          field.focus({ preventScroll: true });
          field.setSelectionRange(field.value.length, field.value.length);
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
    const back = rest ? `${app}, but ${rest}` : app;
    setApp("");
    setText(back);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(app.length, app.length);
    });
  };

  const registry = useContext(RegistryContext);
  const entry = useId();

  const lead = (change: string) =>
    [found?.app, ...examples.map((one) => one.app)].find(
      (name) => name && change.toLowerCase().startsWith(`${name.toLowerCase()} `),
    );

  const asked = () => {
    const change = text.trim().replace(BUT, "");

    if (app) {
      return change ? `${app}, but ${change}` : app;
    }

    if (!change) {
      return fallback;
    }

    const name = lead(change);

    return name ? `${name}, but ${change.slice(name.length).trim().replace(BUT, "")}` : change;
  };

  const hint = live ? "" : app ? "but what you'd change" : fallback;
  useEffect(() => {
    const field = input.current!;

    if (!initial || !matchMedia("(pointer: fine)").matches) {
      return;
    }

    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  const prefetch = () => {
    const name = split(asked()).app;

    if (!known(name)) {
      registry.mount(client.resolve(name))();
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ask = asked();

    const via =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ||
      undefined;

    onSubmit(ask, via);
  };

  return (
    <form className="ask" id={id} onSubmit={submit}>
      <label className="field slots" htmlFor={entry}>
        {app ? (
          <Chip key={app} app={app} face={face?.app === app ? face : undefined} onEdit={unchip} />
        ) : null}
        <span className="entry">
          <textarea
            id={entry}
            ref={input}
            rows={1}
            value={text}
            onChange={(event) => {
              type(event.target.value.replaceAll("\n", " "));
            }}
            onKeyDown={(event) => {
              const field = event.currentTarget;

              if (
                event.key === "Backspace" &&
                app &&
                field.selectionStart === 0 &&
                field.selectionEnd === 0
              ) {
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

              if (typed && !lead(typed) && words(typed) <= 3) {
                chip(typed);

                return;
              }

              field.form?.requestSubmit();
            }}
            onFocus={() => {
              clearTimeout(resume.current);
              setIdle(false);
            }}
            onBlur={() => {
              resume.current = setTimeout(() => {
                setIdle(true);
              }, 1400);
            }}
            placeholder={hint}
            aria-label={app ? `What you'd change in ${app}` : label}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mirror" aria-hidden="true">
            {text || hint}
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
        {asking && !known(asking) ? <Recognize app={asking} onFound={setFound} /> : null}
        <Typer examples={examples} live={live} onLand={setCurrent} />
      </label>
      <button type="submit" onPointerEnter={prefetch} onPointerDown={prefetch} onFocus={prefetch}>
        {action}
      </button>
    </form>
  );
};

const Recognize = ({ app, onFound }: { app: string; onFound: (guess: Guess) => void }) => {
  const result = useAtomValue(client.resolve(app));
  const repo = AsyncResult.isSuccess(result) ? result.value.repo : undefined;
  const name = repo ? squash(repo.name) : "";

  const close =
    repo &&
    ((name.includes(squash(app)) && squash(app).length >= name.length * 0.6) ||
      squash(app).includes(name));

  useEffect(() => {
    if (!repo || !close) {
      return;
    }

    let on = true;

    const shown = () => {
      if (on) {
        onFound({ app, name: repo.name, avatar: repo.avatar });
      }
    };

    if (repo.avatar) {
      const icon = new Image();
      icon.src = repo.avatar;
      void icon.decode().then(shown, shown);
    } else {
      shown();
    }

    return () => {
      on = false;
    };
  }, [repo, close, app]);

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
    {guess.avatar ? <img src={guess.avatar} alt="" /> : null}
    {guess.name}
    <kbd>tab</kbd>
  </button>
);

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

  return ready ? (
    <Badge name={app} avatar={ready.repo.avatar} onEdit={onEdit} />
  ) : (
    <Lookup app={app} face={face} onEdit={onEdit} />
  );
};

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
    {avatar ? <img src={avatar} alt="" /> : <i />}
    {name}
  </button>
);

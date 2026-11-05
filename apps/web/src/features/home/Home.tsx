import { useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useRef } from "react";

import { isAgent, split } from "../../../shared/api.ts";
import type { Agent } from "../../../shared/api.ts";
import facts from "../../lib/facts.json";
import examples from "../../lib/repos/examples.json";
import { known, repoIcon } from "../../lib/repos/known.ts";
import { Footer } from "../../ui/Footer.tsx";
import { ClaudeIcon, OpenAIIcon } from "../../ui/icons.tsx";
import { Nav } from "../../ui/Nav.tsx";
import { useTitle } from "../../ui/useTitle.ts";
import { Ask } from "./Ask.tsx";
import type { AskHandle } from "./Ask.tsx";
import { start } from "./landing.ts";
import { Flow } from "./Plan.tsx";
import { History, Meant, MineToday, Yours } from "./Sections.tsx";
import type { Mine } from "./Sections.tsx";
import type { Example } from "./Typer.tsx";

const EXAMPLES: readonly Example[] = examples.examples.map(({ app, change }) => ({
  app,
  change,
  avatar: known(app)!.repo.avatar,
}));

const Headline = () => (
  <h1>
    <span className="make" data-fork>
      Customized forks
    </span>
    <span className="you never" data-you>
      that maintain themselves.
    </span>
  </h1>
);

const useAsk = () => {
  const navigate = useNavigate();

  return (text: string, agent: Agent | undefined) =>
    void navigate({ to: "/", search: { q: text, agent } });
};

export const Home = ({
  q,
  agent,
  error,
}: {
  q: string;
  agent: Agent | undefined;
  error: string | undefined;
}) => (q ? <Start q={q} agent={agent} error={error} /> : <Landing />);

const Landing = () => {
  const ask = useAsk();
  const page = useRef<HTMLDivElement>(null);
  const composer = useRef<AskHandle>(null);
  useEffect(() => start(page.current!), []);

  const pick = ({ repo, name, change, ask }: Mine, keyboard: boolean) =>
    composer.current?.fill({
      change: ask ?? change,
      keyboard,
      ...(known(name)
        ? { app: name }
        : { app: repo, face: { name: repo.split("/")[1]!, avatar: repoIcon(repo) } }),
    });

  return (
    <div className="page" ref={page}>
      <svg className="graph" aria-hidden="true" />
      <Nav>
        <a href="#how">How it works</a>
        <a href="#self">Run it yourself</a>
        <a href={facts.repo}>GitHub</a>
      </Nav>
      <main className="home">
        <header className="hero">
          <Headline />
          <p className="sub">
            Every release, your changes are reapplied intelligently. When they ship the same
            feature, autofork stops applying yours.
          </p>
          <Ask
            ref={composer}
            id="ask"
            onSubmit={(text, via) => {
              ask(text, isAgent(via) ? via : undefined);
            }}
            examples={EXAMPLES}
            label="An open source app and what you'd change"
            action="Fork it"
          />
          <div className="signin">
            <button type="submit" form="ask" value="chatgpt" className="btn">
              <OpenAIIcon />
              <span>
                <span className="via">Continue with </span>
                ChatGPT
              </span>
            </button>
            <button type="submit" form="ask" value="claude" className="btn">
              <ClaudeIcon />
              <span>
                <span className="via">Continue with </span>
                Claude
              </span>
            </button>
          </div>
          <p className="note">Runs on the ChatGPT or Claude plan you already pay for.</p>
        </header>
        <Meant />
        <MineToday onPick={pick} />
        <Yours />
        <History />
      </main>
      <Footer />
    </div>
  );
};

const Start = ({
  q,
  agent,
  error,
}: {
  q: string;
  agent: Agent | undefined;
  error: string | undefined;
}) => {
  const ask = useAsk();
  const { app } = split(q);
  useTitle(app ? `${app} · autofork` : undefined);

  return (
    <div className="page bare">
      <Nav />
      <main className="start">
        <Headline />
        <Fragment key={q}>
          <Ask
            initial={q}
            onSubmit={(text) => {
              ask(text, agent);
            }}
            examples={EXAMPLES}
            label="An open source app and what you'd change"
            action="Fork it"
          />
          <Flow q={q} agent={agent} error={error} />
        </Fragment>
      </main>
    </div>
  );
};

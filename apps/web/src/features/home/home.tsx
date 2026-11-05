import { useNavigate } from "@tanstack/react-router";
import { Fragment, useRef } from "react";

import { isAgent } from "../../../shared/api.ts";
import type { Agent } from "../../../shared/api.ts";
import facts from "../../lib/facts.json";
import examples from "../../lib/repos/examples.json";
import { known, repoIcon } from "../../lib/repos/known.ts";
import { Footer } from "../../ui/footer.tsx";
import { ClaudeIcon, OpenAIIcon } from "../../ui/icons.tsx";
import { Nav } from "../../ui/nav.tsx";
import { Ask } from "./ask.tsx";
import type { AskHandle } from "./ask.tsx";
import { start } from "./landing.ts";
import { Flow } from "./plan.tsx";
import { History, Meant, MineToday, RunItYourself } from "./sections.tsx";
import type { Mine } from "./sections.tsx";
import type { Example } from "./typer.tsx";

const EXAMPLES: readonly Example[] = examples.examples.flatMap(({ app, change }) => {
  const found = known(app);

  return found === undefined ? [] : [{ app, change, avatar: found.repo.avatar }];
});

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

  return (text: string, agent: Agent | undefined) => {
    void navigate({ to: "/", search: { q: text, agent } });
  };
};

const Landing = () => {
  const submit = useAsk();
  const composer = useRef<AskHandle>(null);

  const pick = ({ repo, name, change, ask }: Mine, keyboard: boolean) => {
    const asked = { change: ask ?? change, keyboard };

    composer.current?.fill(
      known(name) === undefined
        ? {
            ...asked,
            app: repo,
            face: { name: repo.split("/").at(-1) ?? repo, avatar: repoIcon(repo) },
          }
        : { ...asked, app: name },
    );
  };

  return (
    <div className="page" ref={start}>
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
              submit(text, isAgent(via) ? via : undefined);
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
        <RunItYourself />
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
  const submit = useAsk();

  return (
    <div className="page bare">
      <Nav />
      <main className="start">
        <Headline />
        <Fragment key={q}>
          <Ask
            initial={q}
            onSubmit={(text) => {
              submit(text, agent);
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

export const Home = ({
  q,
  agent,
  error,
}: {
  q: string;
  agent: Agent | undefined;
  error: string | undefined;
}) => (q === "" ? <Landing /> : <Start q={q} agent={agent} error={error} />);

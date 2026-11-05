import { CodeBlock } from "./components/CodeBlock";
import { ArrowDownIcon, GitHubIcon } from "./components/Icons";
import { Callout, SpecHeading } from "./components/SpecPrimitives";
import Spec from "./spec.mdx";

const REPO = "https://github.com/AVGVSTVS96/patch_md-spec";

const mdxComponents = {
  pre: CodeBlock,
  blockquote: Callout,
  h2: SpecHeading,
};

function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-6 py-4 backdrop-blur md:px-8">
      <a href="#top" className="flex items-center gap-2 font-medium text-text-h">
        <img src="/favicon.svg" width="20" height="19" alt="" />
        <span>
          PATCH<span className="text-accent">.md</span>
        </span>
      </a>
      <nav className="flex items-center gap-2">
        <a className="card-link max-sm:hidden" href="#spec">
          Spec
        </a>
        <a className="card-link" href={REPO} target="_blank" rel="noreferrer">
          <GitHubIcon />
          <span className="max-sm:sr-only">GitHub</span>
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="w-full px-6 py-14 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl">
        <span className="chip">v0.0.1</span>
        <h1 className="mt-5.5 text-[56px] font-semibold">
          PATCH<span className="text-accent">.md</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-balance">
          A spec for defining agent-healable source patches in markdown
        </p>
        <a className="mt-4 card-link flex w-max flex-wrap" href="#spec">
          <ArrowDownIcon />
          Read the spec
        </a>
      </div>
    </section>
  );
}

function Intro() {
  return (
    <section className="border-t border-border px-6 py-14 md:px-8">
      <div className="mx-auto max-w-2xl *:not-first:mb-3 *:first:mb-5">
        <p>
          <span className="font-semibold text-text-h">PATCH.md</span> is a proposed new spec for
          defining agent-healable source patches in markdown. With a single markdown file, agents
          can self-heal, updating patch definitions when the source changes and re-applying patches.
        </p>
        <p>The file holds two things:</p>
        <ul className="list-['–__'] space-y-1 pl-5 marker:text-accent [&_b]:mr-1 [&_b]:font-semibold [&_b]:text-text-h">
          <li>
            <b>intent</b> written in plain prose
          </li>
          <li>
            <b>patch edits</b> any format diff, patch, edit, or search/replace hunk
          </li>
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-border px-6 py-8 text-sm sm:flex-row md:px-8">
      <p>PATCH.md · v0.0.1 · contributions and proposals welcome.</p>
      <a className="card-link" href={REPO} target="_blank" rel="noreferrer">
        <GitHubIcon />
        GitHub
      </a>
    </footer>
  );
}

export function App() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-240 flex-col border-x border-border">
      <Header />
      <Hero />
      <div className="ticks" />
      <Intro />
      <div className="ticks" />
      <section id="spec" className="border-t border-border px-6 py-16 md:px-8 md:py-20">
        <div className="mx-auto spec-content max-w-2xl">
          <Spec components={mdxComponents} />
        </div>
      </section>
      <div className="ticks" />
      <Footer />
      <div className="h-12 border-t border-border md:h-20" />
    </div>
  );
}

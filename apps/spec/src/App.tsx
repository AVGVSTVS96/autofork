import { ArrowDownIcon, GitHubIcon } from "./components/Icons";
import { CodeBlock } from "./components/CodeBlock";
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
    <section id="top" className="w-full px-6 py-14 md:py-24 md:px-8">
      <div className="max-w-2xl mx-auto">
        <span className="chip">v0.0.1</span>
        <h1 className="mt-5.5 text-[56px] font-semibold">
          PATCH<span className="text-accent">.md</span>
        </h1>
        <p className="max-w-2xl mt-6 text-balance text-lg">
          A spec for defining agent-healable source patches in markdown
        </p>
        <a className="card-link mt-4 flex flex-wrap w-max" href="#spec">
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
      <div className="mx-auto max-w-2xl space-y-5">
        <p>
          <span className="text-text-h">PATCH.md</span> is a spec proposal for defining source
          patches in markdown, which agents can automatically self-heal and update when the source
          changes. A patch file holds two things: its{" "}
          <strong className="text-text-h">intent</strong>, written in plain prose, and its{" "}
          <strong className="text-text-h">patch</strong>, a diff or search/replace hunk that defines
          the current state of the patch&apos;s code.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-border px-6 py-8 text-sm sm:flex-row md:px-8">
      <p>PATCH.md · v0.0.1 . contributions and proposals welcome.</p>
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
        <div className="spec-content mx-auto max-w-2xl">
          <Spec components={mdxComponents} />
        </div>
      </section>
      <div className="ticks" />
      <Footer />
      <div className="h-12 border-t border-border md:h-20" />
    </div>
  );
}

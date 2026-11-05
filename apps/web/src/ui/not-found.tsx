import { Link } from "@tanstack/react-router";

import { Nav } from "./nav.tsx";

export const NotFound = () => (
  <div className="page bare">
    <Nav />
    <main className="fork">
      <header className="fork-head">
        <h1>Nothing here</h1>
      </header>
      <p>
        <Link className="btn primary" to="/" search={{}}>
          Back home
        </Link>
      </p>
    </main>
  </div>
);

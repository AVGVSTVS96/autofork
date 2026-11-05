import facts from "../lib/facts.json";
import { Logo } from "./icons.tsx";

export const Footer = () => (
  <footer>
    <span className="brand small">
      <Logo />
    </span>
    <span className="links">
      <a href={facts.repo}>GitHub</a>
      <span>MIT</span>
    </span>
  </footer>
);

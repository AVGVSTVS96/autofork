/* Accounts from before sign-in went through WorkOS have no Convex session yet */
export const SignInAgain = ({ back, many = false }: { back: string; many?: boolean }) => (
  <p className="fine">
    <a href={`/api/github/start?back=${encodeURIComponent(back)}`}>Sign in again</a> to see what{" "}
    {many ? "your forks'" : "this fork's"} rebuilds cost.
  </p>
);

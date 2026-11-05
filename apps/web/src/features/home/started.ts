import { useNavigate } from "@tanstack/react-router";

export interface Fork {
  owner: string;
  name: string;
}

const RUN_STARTED_LEEWAY = 5000;

export const useStarted = () => {
  const navigate = useNavigate();

  return ({ owner, name }: Fork) => {
    void navigate({
      to: "/$owner/$name",
      params: { owner, name },
      search: { since: new Date(Date.now() - RUN_STARTED_LEEWAY).toISOString() },
    });
  };
};

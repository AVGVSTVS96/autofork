import * as Atom from "effect/reactivity/Atom";

const visible = () => document.visibilityState === "visible";

export const refreshing = <A>(atom: Atom.Atom<A>, every: number) =>
  Atom.readable((get) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = (refresh: boolean) => {
      clearTimeout(timer);

      if (refresh) {
        get.refresh(atom);
      }

      timer = visible()
        ? setTimeout(() => {
            tick(true);
          }, every)
        : undefined;
    };

    const seen = () => {
      tick(visible());
    };

    tick(false);
    document.addEventListener("visibilitychange", seen);
    get.addFinalizer(() => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
    });
  });

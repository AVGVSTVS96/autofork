import { useEffect } from "react";

export const useTitle = (title: string | undefined) => {
  useEffect(() => {
    if (!title) {
      return;
    }

    const before = document.title;
    document.title = title;

    return () => {
      document.title = before;
    };
  }, [title]);
};

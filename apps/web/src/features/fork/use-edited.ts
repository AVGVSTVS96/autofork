import { useState } from "react";

export const useEdited = <A>(base: A) => {
  const [edit, setEdit] = useState<{ base: A; value: A } | null>(null);

  const edited = edit !== null && edit.base === base ? edit.value : base;

  const setEdited = (value: A) => {
    setEdit({ base, value });
  };

  return [edited, setEdited] as const;
};

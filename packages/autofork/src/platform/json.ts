export const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

export const isText = (value: unknown): value is string => typeof value === "string";

export const isFilled = (value: unknown): value is string => isText(value) && value !== "";

export const isNumber = (value: unknown): value is number => typeof value === "number";

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);

export const has = <Key extends string, Value>(
  value: unknown,
  key: Key,
  is: (item: unknown) => item is Value,
): value is Record<Key, Value> =>
  isObject(value) && is(Object.getOwnPropertyDescriptor(value, key)?.value);

export const parseJson = <Value>(
  text: string,
  is: (value: unknown) => value is Value,
): Value | undefined => {
  try {
    const value: unknown = JSON.parse(text);

    return is(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const readBody = async <Value>(
  response: Response,
  is: (value: unknown) => value is Value,
): Promise<Value | undefined> => parseJson(await response.text(), is);

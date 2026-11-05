export const flag = (args: string[], name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;

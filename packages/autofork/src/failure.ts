export class AutoforkError extends Error {
  override readonly name: string = "AutoforkError";
}

export class WaitError extends AutoforkError {
  override readonly name: string = "WaitError";
}

export class NoRoomError extends WaitError {
  override readonly name: string = "NoRoomError";

  readonly why: string;

  constructor(message: string, why = message) {
    super(message);
    this.why = why;
  }
}

export const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

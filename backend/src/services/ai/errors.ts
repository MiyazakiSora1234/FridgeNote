export class AiResponseInvalidError extends Error {
  constructor(
    message: string,
    public raw: unknown,
  ) {
    super(message);
    this.name = "AiResponseInvalidError";
  }
}

export class AiInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvocationError";
  }
}

export class AiFatalError extends Error {
  constructor(
    message: string,
    public reason: string,
  ) {
    super(message);
    this.name = "AiFatalError";
  }
}

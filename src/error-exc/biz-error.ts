export class BizError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(message: string, code: number = 1, status = 200) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "BizError";
  }
}

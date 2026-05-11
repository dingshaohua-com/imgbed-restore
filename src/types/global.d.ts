export {};

declare global {
  interface JsonResult<T = unknown> {
    code: number;
    data: T | null;
    msg: string;
  }
}

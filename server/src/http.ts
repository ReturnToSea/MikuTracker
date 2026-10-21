// An error with an HTTP status, for routes and services to throw: the error handler turns it
// into { error: message } with that status.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

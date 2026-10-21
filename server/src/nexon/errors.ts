// What can go wrong when asking Nexon's rankings about a character, each with a message that
// can be shown as is.
export type NexonErrorKind =
  | "not-found" // not in the rankings at all (a typo, or too low to be ranked)
  | "other-world" // ranked, but on another world than the one asked about
  | "unreachable" // no answer, too slow, or Nexon busy (after retrying)
  | "changed" // Nexon answered in a shape we don't understand: their data may have changed
  | "exp-table"; // the EXP doesn't fit our EXP table: a GMS patch probably changed it

export class NexonError extends Error {
  constructor(
    readonly kind: NexonErrorKind,
    message: string,
  ) {
    super(message);
  }
}

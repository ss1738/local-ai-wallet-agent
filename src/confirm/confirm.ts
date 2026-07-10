import type { Interface } from "node:readline/promises";

export type Confirm = (question: string) => Promise<boolean>;

/**
 * Human-in-the-loop gate. Nothing is broadcast without an explicit yes.
 * Bound to a single shared readline interface so the REPL and the confirmation
 * prompt never contend for stdin.
 */
export function makeConfirm(rl: Interface): Confirm {
  return async (question: string) => {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  };
}

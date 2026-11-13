import { describe, expect, it } from "vitest";
import { summarizeProofRollup } from "./proof-stats";

const internal = (email: string) => email.endsWith("@urganize.app");

describe("summarizeProofRollup", () => {
  it("counts each owner as a team and sums rollouts and tasks", () => {
    expect(
      summarizeProofRollup(
        [
          { owner_email: "ada@example.com", rollouts: 2, tasks: 40 },
          { owner_email: "tolu@example.com", rollouts: "1", tasks: "18" },
        ],
        internal,
      ),
    ).toEqual({ teams: 2, rollouts: 3, tasks: 58 });
  });

  it("leaves our own accounts out", () => {
    expect(
      summarizeProofRollup(
        [
          { owner_email: "ada@example.com", rollouts: 1, tasks: 10 },
          { owner_email: "team@urganize.app", rollouts: 9, tasks: 500 },
        ],
        internal,
      ),
    ).toEqual({ teams: 1, rollouts: 1, tasks: 10 });
  });

  it("matches emails without caring about case or spaces", () => {
    expect(
      summarizeProofRollup([{ owner_email: "  Team@Urganize.App ", rollouts: 3, tasks: 9 }], internal),
    ).toEqual({ teams: 0, rollouts: 0, tasks: 0 });
  });

  it("skips rows with no email, no rollouts or junk numbers", () => {
    expect(
      summarizeProofRollup(
        [
          { owner_email: null, rollouts: 4, tasks: 4 },
          { owner_email: "zero@example.com", rollouts: 0, tasks: 0 },
          { owner_email: "junk@example.com", rollouts: "abc", tasks: 5 },
          { owner_email: "ok@example.com", rollouts: 1, tasks: "-3" },
        ],
        internal,
      ),
    ).toEqual({ teams: 1, rollouts: 1, tasks: 0 });
  });
});

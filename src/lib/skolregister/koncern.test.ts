import { describe, expect, test } from "bun:test";
import { ancestorPath, buildTrädFrånNoder } from "./koncern";
import type { TradNod } from "./types";

const nod = (över: Partial<TradNod> = {}): TradNod => ({
  orgnr: "0000000000",
  namn: "Bolag",
  land: "SE",
  anstallda: null,
  djup: 0,
  ...över,
});

describe("buildTrädFrånNoder", () => {
  test("a flat list of depth-0 nodes stays flat", () => {
    const träd = buildTrädFrånNoder(
      [nod({ orgnr: "1", djup: 0 }), nod({ orgnr: "2", djup: 0 })],
      {},
    );
    expect(träd).toHaveLength(2);
    expect(träd[0]!.barn).toEqual([]);
  });

  test("each node's parent is the closest preceding node one level shallower", () => {
    const träd = buildTrädFrånNoder(
      [
        nod({ orgnr: "moder", djup: 0 }),
        nod({ orgnr: "barn1", djup: 1 }),
        nod({ orgnr: "barnbarn", djup: 2 }),
        nod({ orgnr: "barn2", djup: 1 }),
      ],
      {},
    );
    expect(träd).toHaveLength(1);
    const [moder] = träd;
    expect(moder!.barn.map((b) => b.orgnr)).toEqual(["barn1", "barn2"]);
    expect(moder!.barn[0]!.barn.map((b) => b.orgnr)).toEqual(["barnbarn"]);
    expect(moder!.barn[1]!.barn).toEqual([]);
  });

  test("joins each node against its bolagsstatus", () => {
    const träd = buildTrädFrånNoder([nod({ orgnr: "1", djup: 0 })], {
      "1": {
        orgnr: "1",
        kallor: {},
        status: "avregistrerad",
        organisation: null,
        dokument: [],
        dokumentHamtade: false,
        fel: null,
      },
    });
    expect(träd[0]!.bolagsstatus).toBe("avregistrerad");
  });

  test("a node with no matching bolagsuppslag gets a null status, not a crash", () => {
    const träd = buildTrädFrånNoder([nod({ orgnr: "okänt" })], {});
    expect(träd[0]!.bolagsstatus).toBeNull();
  });
});

describe("ancestorPath", () => {
  const träd = buildTrädFrånNoder(
    [
      nod({ orgnr: "moder", djup: 0 }),
      nod({ orgnr: "barn1", djup: 1 }),
      nod({ orgnr: "barnbarn", djup: 2 }),
      nod({ orgnr: "barn2", djup: 1 }),
    ],
    {},
  );

  test("finds the path from the root down to a deeply nested node", () => {
    expect(ancestorPath(träd, "barnbarn")?.map((n) => n.orgnr)).toEqual([
      "moder",
      "barn1",
      "barnbarn",
    ]);
  });

  test("a top-level match is a path of one", () => {
    expect(ancestorPath(träd, "moder")?.map((n) => n.orgnr)).toEqual(["moder"]);
  });

  test("an orgnr not in the tree resolves to null", () => {
    expect(ancestorPath(träd, "saknas")).toBeNull();
  });
});

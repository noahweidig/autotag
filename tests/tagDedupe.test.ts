import { describe, expect, it } from "vitest";
import {
  findFormatFixes,
  findLocalGroups,
  groupSignature,
  pickTarget,
} from "../src/modules/tagDedupe";
import { tagOpts } from "./helpers";

const t = (name: string, count = 1) => ({ name, count });
const names = (g: { members: { name: string }[] }) =>
  g.members.map((m) => m.name).sort();

describe("pickTarget", () => {
  it("prefers usage, then shorter, then alphabetical", () => {
    expect(pickTarget([t("a", 1), t("b", 5)]).name).toBe("b");
    expect(pickTarget([t("long tag", 2), t("tag", 2)]).name).toBe("tag");
    expect(pickTarget([t("b", 2), t("a", 2)]).name).toBe("a");
  });
});

describe("findLocalGroups", () => {
  it("groups case, separator and plural variants as format", () => {
    const g = findLocalGroups([
      t("Machine Learning", 9),
      t("machine-learning", 2),
      t("machine learnings", 1),
      t("physics", 4),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("format");
    expect(g[0].target).toBe("Machine Learning");
    expect(names(g[0])).toHaveLength(3);
  });

  it("groups one-edit typos in long tags", () => {
    const g = findLocalGroups([t("machine learning", 8), t("machin learning")]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("similar");
    expect(g[0].target).toBe("machine learning");
  });

  it("does not group short look-alike words", () => {
    expect(
      findLocalGroups([t("graph"), t("grape"), t("model"), t("modal")]),
    ).toEqual([]);
  });

  it("does not group tags that differ only in digits", () => {
    expect(findLocalGroups([t("covid19", 3), t("covid20", 3)])).toEqual([]);
    expect(findLocalGroups([t("gpt3", 3), t("gpt4", 3)])).toEqual([]);
  });

  it("groups reordered words", () => {
    const g = findLocalGroups([t("science data", 1), t("data science", 5)]);
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe("data science");
  });

  it("flags abbreviations", () => {
    const g = findLocalGroups([t("machine learning", 9), t("ML", 3)]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("abbreviation");
    expect(g[0].target).toBe("machine learning");
  });

  it("skips fuzzy matching when disabled", () => {
    const tags = [t("machine learning", 8), t("machin learning"), t("ML")];
    expect(findLocalGroups(tags, { fuzzy: false })).toEqual([]);
  });

  it("compares against group heads so groups do not chain", () => {
    // a~b and b~c differ by one edit each, but a and c differ by two.
    const g = findLocalGroups([
      t("abcdefgh", 9),
      t("abcdefgx", 5),
      t("abcdefxx", 1),
    ]);
    expect(g).toHaveLength(1);
    expect(names(g[0])).toEqual(["abcdefgh", "abcdefgx"]);
  });

  it("returns nothing for clean tags", () => {
    expect(
      findLocalGroups([t("physics"), t("chemistry"), t("neural networks")]),
    ).toEqual([]);
  });
});

describe("groupSignature", () => {
  it("ignores order and formatting", () => {
    expect(groupSignature([t("B b"), t("a")])).toBe(
      groupSignature([t("a"), t("b-b")]),
    );
  });
});

describe("findFormatFixes", () => {
  it("renames tags that break the configured style", () => {
    const g = findFormatFixes(
      [t("Deep/Learning", 2), t("Deep Learning", 7), t("fine", 1)],
      tagOpts(),
    );
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe("Deep Learning");
    expect(names(g[0])).toEqual(["Deep Learning", "Deep/Learning"]);
  });

  it("applies case style but never truncates long tags", () => {
    const long = "a very long tag name with many many words in it";
    const g = findFormatFixes(
      [t(long.toUpperCase(), 1)],
      tagOpts({ tagCase: "lower", maxWords: 2, maxLength: 10 }),
    );
    expect(g[0].target).toBe(long);
  });

  it("leaves prefixed tags alone", () => {
    expect(
      findFormatFixes([t("auto:Deep/Learning")], tagOpts({ prefix: "auto:" })),
    ).toEqual([]);
  });
});

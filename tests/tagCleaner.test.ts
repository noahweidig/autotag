import { describe, expect, it } from "vitest";
import {
  canonicalKey,
  cleanTag,
  cleanTagList,
} from "../src/modules/tagCleaner";
import { tagOpts } from "./helpers";

describe("cleanTag", () => {
  it("replaces slashes with spaces", () => {
    expect(cleanTag("Deep/Learning", tagOpts())).toBe("Deep Learning");
    expect(cleanTag("a\\b|c", tagOpts())).toBe("a b c");
  });

  it("keeps slashes when disabled", () => {
    expect(
      cleanTag("a/b", tagOpts({ stripSlashes: false, stripSpecial: false })),
    ).toBe("a/b");
  });

  it("strips symbols, markup, and zero-width/control characters", () => {
    expect(cleanTag("«weird»​ tag™", tagOpts())).toBe("weird tag");
    expect(cleanTag("<b>bold</b> idea", tagOpts())).toBe("bold idea");
    expect(cleanTag("a\u0000b", tagOpts())).toBe("ab");
  });

  it("keeps letters from other scripts and c++/c#", () => {
    expect(cleanTag("機械学習", tagOpts())).toBe("機械学習");
    expect(cleanTag("C++", tagOpts())).toBe("C++");
    expect(cleanTag("C#", tagOpts())).toBe("C#");
  });

  it("removes list markers, hashes, and wrapping quotes", () => {
    expect(cleanTag("1. neural nets", tagOpts())).toBe("neural nets");
    expect(cleanTag("- #graphs", tagOpts())).toBe("graphs");
    expect(cleanTag('"quoted"', tagOpts())).toBe("quoted");
  });

  it("collapses repeated whitespace", () => {
    expect(cleanTag("  a    b  ", tagOpts())).toBe("a b");
  });

  it("returns empty for junk", () => {
    expect(cleanTag("///", tagOpts())).toBe("");
    expect(cleanTag("!!!", tagOpts())).toBe("");
    expect(cleanTag("", tagOpts())).toBe("");
  });

  it("applies case styles", () => {
    expect(cleanTag("Deep Learning", tagOpts({ tagCase: "lower" }))).toBe(
      "deep learning",
    );
    expect(cleanTag("Deep Learning", tagOpts({ tagCase: "snake" }))).toBe(
      "deep_learning",
    );
    expect(cleanTag("Deep Learning", tagOpts({ tagCase: "kebab" }))).toBe(
      "deep-learning",
    );
    expect(cleanTag("deep LEARNING", tagOpts({ tagCase: "title" }))).toBe(
      "Deep Learning",
    );
  });

  it("applies separator overrides", () => {
    expect(
      cleanTag("deep learning", tagOpts({ separator: "underscore" })),
    ).toBe("deep_learning");
    expect(cleanTag("deep_learning", tagOpts({ separator: "hyphen" }))).toBe(
      "deep-learning",
    );
    expect(cleanTag("deep-learning", tagOpts({ separator: "space" }))).toBe(
      "deep learning",
    );
  });

  it("limits words and length", () => {
    expect(cleanTag("one two three four five", tagOpts({ maxWords: 3 }))).toBe(
      "one two three",
    );
    const long = cleanTag(
      "alpha beta gamma delta",
      tagOpts({ maxLength: 12, maxWords: 0 }),
    );
    expect(long.length).toBeLessThanOrEqual(12);
    expect(long).toBe("alpha beta");
  });

  it("applies replacements case-insensitively", () => {
    const o = tagOpts({ replacements: [["ml", "machine learning"]] });
    expect(cleanTag("ML", o)).toBe("machine learning");
  });
});

describe("canonicalKey", () => {
  it("ignores case, separators, accents, and simple plurals", () => {
    const k = canonicalKey("Neural-Networks");
    expect(canonicalKey("neural networks")).toBe(k);
    expect(canonicalKey("neural_network")).toBe(k);
    expect(canonicalKey("Café")).toBe(canonicalKey("cafe"));
    expect(canonicalKey("Theories")).toBe(canonicalKey("theory"));
  });

  it("does not merge unrelated words or strip -ss", () => {
    expect(canonicalKey("class")).toBe("class");
    expect(canonicalKey("cat")).not.toBe(canonicalKey("car"));
  });
});

describe("cleanTagList", () => {
  it("merges duplicates, keeping the first spelling", () => {
    const out = cleanTagList(
      ["Deep Learning", "deep-learning", "DEEP LEARNINGS"],
      tagOpts(),
    );
    expect(out).toEqual(["Deep Learning"]);
  });

  it("keeps duplicates when dedupe is off", () => {
    const out = cleanTagList(["a", "A"], tagOpts({ dedupe: false }));
    expect(out).toEqual(["a", "A"]);
  });

  it("reuses the spelling of library tags", () => {
    const out = cleanTagList(["deep learning", "graph"], tagOpts(), {
      libraryTags: ["Deep Learning"],
    });
    expect(out).toEqual(["Deep Learning", "graph"]);
  });

  it("does not use library spelling when merging is off", () => {
    const out = cleanTagList(
      ["deep learning"],
      tagOpts({ mergeWithLibrary: false }),
      {
        libraryTags: ["Deep Learning"],
      },
    );
    expect(out).toEqual(["deep learning"]);
  });

  it("drops blacklisted tags", () => {
    const out = cleanTagList(
      ["paper", "Study", "graphs"],
      tagOpts({ blacklist: ["paper", "study"] }),
    );
    expect(out).toEqual(["graphs"]);
  });

  it("splits tags joined with semicolons or newlines", () => {
    expect(cleanTagList(["a;b\nc"], tagOpts())).toEqual(["a", "b", "c"]);
  });

  it("restricts to seeds and uses their spelling", () => {
    const out = cleanTagList(
      ["crispr", "other", "Machine Learning"],
      tagOpts({ restrictToSeeds: true }),
      {
        seeds: ["CRISPR", "machine learning"],
      },
    );
    expect(out).toEqual(["CRISPR", "machine learning"]);
  });

  it("does not restrict when there are no seeds", () => {
    expect(
      cleanTagList(["x"], tagOpts({ restrictToSeeds: true }), { seeds: [] }),
    ).toEqual(["x"]);
  });

  it("adds a prefix once", () => {
    const o = tagOpts({ prefix: "ai:" });
    expect(cleanTagList(["graphs", "ai:graphs"], o)).toEqual(["ai:graphs"]);
  });

  it("matches prefixed library tags and keeps the prefix intact", () => {
    const o = tagOpts({ prefix: "ai:" });
    expect(
      cleanTagList(["deep learning"], o, { libraryTags: ["ai:Deep Learning"] }),
    ).toEqual(["ai:Deep Learning"]);
  });

  it("caps tags per item, 0 means unlimited", () => {
    const many = ["a1", "b2", "c3", "d4"];
    expect(cleanTagList(many, tagOpts({ maxPerItem: 2 }))).toHaveLength(2);
    expect(cleanTagList(many, tagOpts({ maxPerItem: 0 }))).toHaveLength(4);
  });

  it("handles empty and non-string input", () => {
    expect(cleanTagList([], tagOpts())).toEqual([]);
    expect(
      cleanTagList([null as any, undefined as any, "", "ok"], tagOpts()),
    ).toEqual(["ok"]);
  });

  it("is idempotent", () => {
    const o = tagOpts({ tagCase: "snake" });
    const once = cleanTagList(
      ["Deep/Learning!!", "#Neural-Networks", "ML / AI "],
      o,
    );
    expect(cleanTagList(once, o)).toEqual(once);
  });
});

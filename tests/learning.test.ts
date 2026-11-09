import { describe, expect, it } from "vitest";
import {
  applyLearning,
  emptyLearned,
  pairCorrections,
  parseLearned,
  recordFeedback,
  summarize,
} from "../src/modules/learning";

describe("pairCorrections", () => {
  it("pairs a lone swap", () => {
    expect(pairCorrections(["ML"], ["machine learning"])).toEqual([
      ["ML", "machine learning"],
    ]);
  });
  it("pairs acronyms among several edits", () => {
    expect(
      pairCorrections(["ML", "birds"], ["machine learning", "wetlands"]),
    ).toEqual([["ML", "machine learning"]]);
  });
  it("does not pair unrelated tags when several changed", () => {
    expect(pairCorrections(["birds", "fire"], ["wetlands", "soil"])).toEqual(
      [],
    );
  });
});

describe("recordFeedback and applyLearning", () => {
  const swap = {
    suggested: ["ML", "birds"],
    final: ["machine learning", "birds"],
  };

  it("needs two repeats before an alias applies", () => {
    let l = recordFeedback(emptyLearned(), [swap]);
    expect(applyLearning(["ML"], l)).toEqual(["ML"]);
    l = recordFeedback(l, [swap]);
    expect(applyLearning(["ML", "ml"], l)).toEqual(["machine learning"]);
  });

  it("hides a tag after two net removals", () => {
    const rm = { suggested: ["grassland", "birds"], final: ["birds"] };
    let l = recordFeedback(emptyLearned(), [rm]);
    expect(applyLearning(["grassland"], l)).toEqual(["grassland"]);
    l = recordFeedback(l, [rm]);
    expect(applyLearning(["Grassland", "birds"], l)).toEqual(["birds"]);
  });

  it("keeps a tag the user also accepts", () => {
    const rm = { suggested: ["grassland"], final: [] };
    const keep = { suggested: ["grassland"], final: ["grassland"] };
    let l = recordFeedback(emptyLearned(), [rm, rm, keep]);
    expect(applyLearning(["grassland"], l)).toEqual(["grassland"]);
    l = recordFeedback(l, [rm]);
    expect(applyLearning(["grassland"], l)).toEqual([]);
  });

  it("round-trips through JSON and tolerates junk", () => {
    const l = recordFeedback(emptyLearned(), [swap, swap]);
    expect(parseLearned(JSON.stringify(l))).toEqual(l);
    expect(parseLearned("not json")).toEqual(emptyLearned());
    expect(parseLearned("")).toEqual(emptyLearned());
  });

  it("summarizes what is active", () => {
    const l = recordFeedback(emptyLearned(), [swap, swap]);
    const s = summarize(l);
    expect(s.aliases).toEqual([["ml", "machine learning", 2]]);
  });
});

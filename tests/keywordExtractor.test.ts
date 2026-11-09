import { describe, expect, it } from "vitest";
import { extractKeywords } from "../src/modules/keywordExtractor";

const TITLE = "Deep learning for protein structure prediction";
const ABS =
  "We present a deep learning method for protein structure prediction. " +
  "The neural network predicts residue contacts from multiple sequence alignments, " +
  "and the predicted contacts improve protein structure prediction accuracy. " +
  "Results show that deep learning outperforms earlier methods.";

describe("extractKeywords", () => {
  it("returns specific phrases, not stopwords", () => {
    const out = extractKeywords(TITLE, ABS, { max: 5 });
    expect(out).toContain("protein structure prediction");
    expect(out.join(" ")).not.toMatch(/\b(we|the|results)\b/);
  });
  it("respects max and avoids overlapping phrases", () => {
    const out = extractKeywords(TITLE, ABS, { max: 3 });
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out).not.toContain("protein");
  });
  it("handles empty input", () => {
    expect(extractKeywords("", "")).toEqual([]);
  });
  it("works with a title only", () => {
    expect(
      extractKeywords("Graphene transistors at room temperature", ""),
    ).toContain("graphene transistors");
  });
  it("is deterministic", () => {
    expect(extractKeywords(TITLE, ABS)).toEqual(extractKeywords(TITLE, ABS));
  });
});

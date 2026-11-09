import { describe, expect, it } from "vitest";
import {
  buildCleanupPrompt,
  clampBudget,
  mergeCapped,
  parseCleanupResponse,
  parseList,
  planScan,
} from "../src/modules/cleanupAI";
import { canonicalKey } from "../src/modules/tagCleaner";

const make = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `tag${String(i).padStart(3, "0")}x`,
    count: n - i,
  }));
const budget = { maxTagsPerRequest: 50, maxRequests: 2, anchorCount: 10 };

describe("planScan", () => {
  it("caps tags per request and requests per scan", () => {
    const p = planScan(make(500), new Set(), budget);
    expect(p.chunks).toHaveLength(2);
    for (const c of p.chunks)
      expect(c.candidates.length + c.anchors.length).toBeLessThanOrEqual(50);
    expect(p.sent).toBe(80);
    expect(p.pending).toBe(420);
  });

  it("sends the most used tags first", () => {
    const p = planScan(make(500), new Set(), budget);
    expect(p.chunks[0].candidates).toContain("tag000x");
    expect(p.chunks[0].candidates).not.toContain("tag499x");
  });

  it("skips reviewed and locally grouped tags", () => {
    const tags = make(30);
    const skip = new Set(tags.slice(0, 20).map((t) => canonicalKey(t.name)));
    const p = planScan(tags, skip, { ...budget, anchorCount: 0 });
    expect(p.sent).toBe(10);
    expect(p.chunks[0].candidates).not.toContain("tag000x");
  });

  it("adds top tags as anchors to later chunks only when not already sent", () => {
    const p = planScan(make(500), new Set(), budget);
    expect(p.chunks[0].anchors).toEqual([]);
    expect(p.chunks[1].anchors).toHaveLength(10);
    expect(p.chunks[1].anchors).toContain("tag000x");
  });

  it("plans nothing when everything is reviewed", () => {
    const tags = make(10);
    const skip = new Set(tags.map((t) => canonicalKey(t.name)));
    const p = planScan(tags, skip, budget);
    expect(p.chunks).toEqual([]);
    expect(p.sent).toBe(0);
  });

  it("estimates tokens for what it sends", () => {
    const p = planScan(make(40), new Set(), budget);
    expect(p.estimatedTokens).toBeGreaterThan(100);
    expect(p.estimatedTokens).toBeLessThan(1000);
  });
});

describe("buildCleanupPrompt", () => {
  it("lists tag names only", () => {
    const prompt = buildCleanupPrompt({
      anchors: ["machine learning"],
      candidates: ["ML", "deep learning"],
    });
    expect(prompt).toContain("ML\ndeep learning");
    expect(prompt).toContain("machine learning");
    expect(prompt).toContain('{"groups"');
    expect(prompt).not.toMatch(/\d+ items?/);
  });
});

describe("parseCleanupResponse", () => {
  const chunk = {
    anchors: ["machine learning"],
    candidates: ["ML", "Machine Learning ", "physics"],
  };

  it("parses groups and repairs case", () => {
    const g = parseCleanupResponse(
      '```json\n{"groups":[["machine learning","ml","machine learning"]]}\n```',
      chunk,
    );
    expect(g).toEqual([["machine learning", "ML"]]);
  });

  it("drops made-up tags and groups that shrink below 2", () => {
    expect(
      parseCleanupResponse('{"groups":[["ML","invented tag"]]}', chunk),
    ).toEqual([]);
  });

  it("requires at least one candidate", () => {
    expect(
      parseCleanupResponse('{"groups":[["machine learning"]]}', chunk),
    ).toEqual([]);
    const c = { anchors: ["a", "b"], candidates: ["c", "d"] };
    expect(parseCleanupResponse('{"groups":[["a","b"]]}', c)).toEqual([]);
  });

  it("uses each tag once", () => {
    const c = { anchors: [], candidates: ["a1", "b1", "c1"] };
    expect(
      parseCleanupResponse('{"groups":[["a1","b1"],["b1","c1"]]}', c),
    ).toEqual([["a1", "b1"]]);
  });

  it("accepts keep/merge objects and bare arrays", () => {
    const c = { anchors: [], candidates: ["a1", "b1", "c1"] };
    expect(
      parseCleanupResponse('{"groups":[{"keep":"a1","merge":["b1"]}]}', c),
    ).toEqual([["a1", "b1"]]);
    expect(parseCleanupResponse('[["b1","c1"]]', c)).toEqual([["b1", "c1"]]);
  });

  it("throws readable errors on bad output", () => {
    expect(() => parseCleanupResponse("nope", chunk)).toThrow(/invalid JSON/);
    expect(() => parseCleanupResponse('{"x":1}', chunk)).toThrow(/groups/);
  });
});

describe("budget and stored lists", () => {
  it("clamps budget values", () => {
    expect(
      clampBudget({
        maxTagsPerRequest: 99999,
        maxRequests: 0,
        anchorCount: -3,
      }),
    ).toEqual({ maxTagsPerRequest: 500, maxRequests: 1, anchorCount: 0 });
    expect(clampBudget({ maxTagsPerRequest: NaN }).maxTagsPerRequest).toBe(150);
  });

  it("keeps only the newest entries without duplicates", () => {
    expect(mergeCapped(["a", "b"], ["b", "c", "d"], 3)).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  it("parses stored JSON defensively", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList("{oops")).toEqual([]);
    expect(parseList('["a",1]')).toEqual(["a", "1"]);
  });
});

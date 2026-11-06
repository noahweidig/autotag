import { describe, expect, it } from "vitest";
import { parseTagResponse, sanitizeJson } from "../src/modules/llmJson";

describe("sanitizeJson", () => {
  it("strips code fences", () => {
    expect(sanitizeJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(sanitizeJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts JSON surrounded by prose", () => {
    expect(sanitizeJson('Sure! Here you go: {"a":1} Hope that helps.')).toBe(
      '{"a":1}',
    );
  });

  it("strips a leading json label", () => {
    expect(sanitizeJson('json\n{"a":1}')).toBe('{"a":1}');
  });
});

describe("parseTagResponse", () => {
  it("parses the expected shape", () => {
    const out = parseTagResponse('{"items":[{"key":"K1","tags":["a","b"]}]}', [
      "K1",
    ]);
    expect(out).toEqual([{ key: "K1", tags: ["a", "b"] }]);
  });

  it("accepts a bare array", () => {
    expect(parseTagResponse('[{"key":"K1","tags":["a"]}]', ["K1"])).toEqual([
      { key: "K1", tags: ["a"] },
    ]);
  });

  it("accepts tags as a comma separated string", () => {
    expect(
      parseTagResponse('{"items":[{"key":"K1","tags":"a, b"}]}', ["K1"])[0]
        .tags,
    ).toEqual(["a", " b"]);
  });

  it("falls back to position when keys are wrong and counts match", () => {
    const out = parseTagResponse(
      '{"items":[{"key":"bad","tags":["a"]},{"tags":["b"]}]}',
      ["K1", "K2"],
    );
    expect(out.map((x) => x.key)).toEqual(["K1", "K2"]);
  });

  it("drops entries with unknown keys when counts differ", () => {
    const out = parseTagResponse('{"items":[{"key":"bad","tags":["a"]}]}', [
      "K1",
      "K2",
    ]);
    expect(out).toEqual([]);
  });

  it("yields empty tags for missing tag arrays", () => {
    expect(parseTagResponse('{"items":[{"key":"K1"}]}', ["K1"])).toEqual([
      { key: "K1", tags: [] },
    ]);
  });

  it("throws readable errors", () => {
    expect(() => parseTagResponse("not json at all", ["K1"])).toThrow(
      /invalid JSON/,
    );
    expect(() => parseTagResponse('{"foo":1}', ["K1"])).toThrow(/items/);
  });
});

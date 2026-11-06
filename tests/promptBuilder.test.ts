import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/modules/promptBuilder";
import type { ItemMetadata } from "../src/modules/autotagItems";
import { contentOpts, tagOpts } from "./helpers";

const item = (o: Partial<ItemMetadata> = {}): ItemMetadata => ({
  key: "ABC123",
  itemType: "journalArticle",
  title: "A Title",
  abstract: "An abstract.",
  publicationTitle: "Nature",
  date: "2020",
  doi: "10.1/xyz",
  creators: ["Doe, Jane", "Roe, Rich"],
  tags: ["old"],
  pdfText: "full text here",
  ...o,
});

const build = (o: Partial<Parameters<typeof buildPrompt>[0]> = {}) =>
  buildPrompt({
    items: [item()],
    basePrompt: "BASE",
    seeds: "",
    vocab: [],
    content: contentOpts(),
    tags: tagOpts(),
    ...o,
  });

describe("buildPrompt", () => {
  it("includes the base prompt, format spec, and item key", () => {
    const p = build();
    expect(p.startsWith("BASE")).toBe(true);
    expect(p).toContain('{"items":[{"key":');
    expect(p).toContain("key: ABC123");
    expect(p).toContain("title: A Title");
  });

  it("respects content toggles", () => {
    const p = build({
      content: contentOpts({
        includeTitle: false,
        includeCreators: false,
        includeAbstract: false,
        includeDate: false,
        includePublicationTitle: false,
        includeExistingTags: false,
      }),
    });
    for (const s of [
      "title:",
      "creators:",
      "abstract:",
      "date:",
      "journal:",
      "existing_tags:",
    ]) {
      expect(p).not.toContain(s);
    }
    expect(p).toContain("key: ABC123");
  });

  it("includes DOI and PDF text only when enabled", () => {
    expect(build()).not.toContain("doi:");
    expect(build()).not.toContain("pdf_text:");
    const p = build({
      content: contentOpts({ includeDOI: true, includePdfText: true }),
    });
    expect(p).toContain("doi: 10.1/xyz");
    expect(p).toContain("full text here");
  });

  it("uses placeholders for missing abstract and PDF text", () => {
    const p = build({
      items: [item({ abstract: "", pdfText: "" })],
      content: contentOpts({ includePdfText: true }),
    });
    expect(p).toContain("[no abstract available]");
    expect(p).toContain("[no extracted PDF text available]");
  });

  it("states tag limits, language, and case rules", () => {
    const p = build({
      tags: tagOpts({ maxPerItem: 5, language: "French", tagCase: "snake" }),
    });
    expect(p).toContain("at most 5 tags");
    expect(p).toContain("in French");
    expect(p).toContain("snake_case");
  });

  it("omits the max-tags rule when unlimited", () => {
    expect(build({ tags: tagOpts({ maxPerItem: 0 }) })).not.toContain(
      "at most",
    );
  });

  it("adds seed keywords, with strict wording when restricted", () => {
    const loose = build({ seeds: "a, b" });
    expect(loose).toContain("seed_keywords = [a, b]");
    expect(loose).toContain("Prefer these tags");
    const strict = build({
      seeds: "a, b",
      tags: tagOpts({ restrictToSeeds: true }),
    });
    expect(strict).toContain("Use ONLY tags from this list");
  });

  it("adds library vocabulary only when provided", () => {
    expect(build()).not.toContain("already used in this library");
    expect(build({ vocab: ["x", "y"] })).toContain("x, y");
  });

  it("separates multiple papers", () => {
    const p = build({ items: [item(), item({ key: "XYZ789" })] });
    expect(p).toContain("Paper 1:");
    expect(p).toContain("Paper 2:");
    expect(p).toContain("key: XYZ789");
  });
});

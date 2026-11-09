import { describe, expect, it } from "vitest";
import {
  normalizeDOI,
  parseCrossrefWork,
  parseOpenAlexWork,
  parsePubmedXml,
} from "../src/modules/sourceParsers";

describe("normalizeDOI", () => {
  it("strips prefixes and lowercases", () => {
    expect(normalizeDOI("https://doi.org/10.1038/NATURE14539")).toBe(
      "10.1038/nature14539",
    );
    expect(normalizeDOI("doi: 10.1000/xyz")).toBe("10.1000/xyz");
  });
  it("rejects non-DOIs", () => {
    expect(normalizeDOI("")).toBe("");
    expect(normalizeDOI("arXiv:1234.5678")).toBe("");
  });
});

describe("parseOpenAlexWork", () => {
  const work = {
    keywords: [
      { display_name: "backpropagation", score: 0.77 },
      { display_name: "deep learning", score: 1 },
      { display_name: "weak one", score: 0.2 },
    ],
    topics: [
      { score: 0.1, subfield: { display_name: "Other" } },
      { score: 0.8, subfield: { display_name: "Artificial Intelligence" } },
    ],
  };
  it("filters by score, sorts, adds top subfield", () => {
    expect(parseOpenAlexWork(work, 0.5, true)).toEqual([
      "deep learning",
      "backpropagation",
      "Artificial Intelligence",
    ]);
  });
  it("can skip the subfield", () => {
    expect(parseOpenAlexWork(work, 0.5, false)).toHaveLength(2);
  });
  it("tolerates missing fields", () => {
    expect(parseOpenAlexWork({}, 0.5, true)).toEqual([]);
    expect(parseOpenAlexWork(null, 0.5, true)).toEqual([]);
  });
});

describe("parseCrossrefWork", () => {
  it("reads message.subject", () => {
    expect(
      parseCrossrefWork({ message: { subject: ["Oncology", "Biology"] } }),
    ).toEqual(["Oncology", "Biology"]);
    expect(parseCrossrefWork({ message: {} })).toEqual([]);
  });
});

describe("parsePubmedXml", () => {
  const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">26017442</PMID>
  <KeywordList><Keyword MajorTopicYN="N">machine learning</Keyword></KeywordList>
  <MeshHeadingList>
   <MeshHeading><DescriptorName UI="D000465" MajorTopicYN="N">Algorithms</DescriptorName></MeshHeading>
   <MeshHeading><DescriptorName UI="D001185" MajorTopicYN="Y">Artificial Intelligence</DescriptorName></MeshHeading>
   <MeshHeading><DescriptorName UI="D1" MajorTopicYN="N">Cats &amp; Dogs</DescriptorName></MeshHeading>
  </MeshHeadingList></MedlineCitation></PubmedArticle></PubmedArticleSet>`;
  it("orders major MeSH, author keywords, other MeSH and decodes entities", () => {
    expect(parsePubmedXml(xml).get("26017442")).toEqual([
      "Artificial Intelligence",
      "machine learning",
      "Algorithms",
      "Cats & Dogs",
    ]);
  });
});

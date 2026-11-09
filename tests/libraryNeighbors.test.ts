import { describe, expect, it } from "vitest";
import {
  buildIndex,
  suggestFromNeighbors,
  type LibDoc,
} from "../src/modules/libraryNeighbors";

const doc = (
  key: string,
  title: string,
  abstract: string,
  tags: string[],
): LibDoc => ({
  key,
  title,
  abstract,
  tags,
});

const corpus: LibDoc[] = [
  doc(
    "a1",
    "Wildfire severity in conifer forests",
    "Burn severity and fire regimes in western conifer forests under drought.",
    ["wildfire", "forests"],
  ),
  doc(
    "a2",
    "Fire regimes and forest recovery",
    "Post-fire forest recovery depends on burn severity and seed sources.",
    ["wildfire", "forests", "recovery"],
  ),
  doc(
    "a3",
    "Prescribed burning and fuel reduction",
    "Prescribed fire reduces fuel loads and wildfire severity in dry forests.",
    ["wildfire", "fuels"],
  ),
  doc(
    "b1",
    "Convolutional networks for image classification",
    "Deep convolutional neural networks classify images with high accuracy.",
    ["deep learning", "computer vision"],
  ),
  doc(
    "b2",
    "Neural networks for object detection",
    "Deep neural networks detect objects in images using convolutional layers.",
    ["deep learning", "computer vision"],
  ),
  doc(
    "b3",
    "Training deep neural networks",
    "Optimisation of deep neural networks with stochastic gradient descent.",
    ["deep learning"],
  ),
  doc("n1", "Untagged paper", "Nothing here", []),
];

describe("suggestFromNeighbors", () => {
  const index = buildIndex(corpus);

  it("skips untagged documents", () => {
    expect(index.size).toBe(6);
  });

  it("suggests the neighbours' tags for a wildfire paper", () => {
    const out = suggestFromNeighbors(index, {
      key: "q",
      title: "Burn severity after wildfire in conifer forests",
      abstract:
        "We study fire severity and forest recovery in dry conifer forests.",
    });
    const tags = out.map((s) => s.tag);
    expect(tags[0]).toBe("wildfire");
    expect(tags).toContain("forests");
    expect(tags).not.toContain("deep learning");
  });

  it("suggests the neighbours' tags for a vision paper", () => {
    const out = suggestFromNeighbors(index, {
      key: "q",
      title: "Deep convolutional neural networks for images",
      abstract: "Convolutional layers classify images.",
    });
    expect(out.map((s) => s.tag)).toContain("deep learning");
  });

  it("never votes with the item itself", () => {
    const out = suggestFromNeighbors(index, {
      key: "a1",
      title: corpus[0].title,
      abstract: corpus[0].abstract,
    });
    // still finds a2/a3, but a1 is excluded from the vote
    expect(out.find((s) => s.tag === "wildfire")?.support).toBe(2);
  });

  it("returns nothing for unrelated text", () => {
    expect(
      suggestFromNeighbors(index, {
        key: "q",
        title: "Medieval poetry",
        abstract: "Sonnets and ballads of the thirteenth century.",
      }),
    ).toEqual([]);
  });

  it("handles an empty library", () => {
    expect(
      suggestFromNeighbors(buildIndex([]), {
        key: "q",
        title: "x",
        abstract: "y",
      }),
    ).toEqual([]);
  });
});

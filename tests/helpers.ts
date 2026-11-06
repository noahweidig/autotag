import type {
  PromptContentOptions,
  TagOptions,
} from "../src/modules/autotagPrefs";

export const tagOpts = (o: Partial<TagOptions> = {}): TagOptions => ({
  separator: "keep",
  stripSlashes: true,
  stripSpecial: true,
  dedupe: true,
  mergeWithLibrary: true,
  maxWords: 4,
  maxLength: 40,
  blacklist: [],
  replacements: [],
  maxPerItem: 8,
  tagCase: "keep",
  prefix: "",
  language: "",
  asAutomatic: false,
  skipTagged: false,
  restrictToSeeds: false,
  reuseLibraryTags: false,
  libraryVocabLimit: 100,
  marker: "",
  ...o,
});

export const contentOpts = (
  o: Partial<PromptContentOptions> = {},
): PromptContentOptions => ({
  includeTitle: true,
  includeCreators: true,
  includePublicationTitle: true,
  includeDate: true,
  includeDOI: false,
  includeExistingTags: true,
  includeAbstract: true,
  includePdfText: false,
  pdfTextMode: "first_n_chars",
  pdfTextCharLimit: 4000,
  ...o,
});

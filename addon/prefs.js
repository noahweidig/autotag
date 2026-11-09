pref("llmProvider", "openai");

pref("apiKey.openai", "");
pref("apiKey.anthropic", "");
pref("apiKey.gemini", "");
pref("apiKey.deepseek", "");
pref("apiKey.openrouter", "");
pref("apiKey.custom", "");

pref("model.openai", "");
pref("model.anthropic", "");
pref("model.gemini", "");
pref("model.deepseek", "");
pref("model.openrouter", "");
pref("model.custom", "");
pref("model.local", "");

pref("baseURL.openai", "");
pref("baseURL.anthropic", "");
pref("baseURL.deepseek", "");
pref("baseURL.openrouter", "");
pref("baseURL.custom", "");
pref("baseURL.local", "");

pref("gen.temperature", "0.2");
pref("gen.maxTokens", 0);
pref("gen.timeoutSec", 120);
pref("gen.batchSize", 5);
pref("gen.jsonMode", false);

pref("content.includeTitle", true);
pref("content.includeCreators", true);
pref("content.includePublicationTitle", true);
pref("content.includeDate", true);
pref("content.includeDOI", false);
pref("content.includeExistingTags", true);
pref("content.includeAbstract", true);
pref("content.includePdfText", false);
pref("content.pdfTextMode", "first_n_chars");
pref("content.pdfTextCharLimit", 4000);

pref("tags.maxPerItem", 8);
pref("tags.case", "keep");
pref("tags.prefix", "");
pref("tags.language", "");
pref("tags.asAutomatic", false);
pref("tags.skipTagged", false);
pref("tags.restrictToSeeds", false);
pref("tags.reuseLibraryTags", false);
pref("tags.libraryVocabLimit", 100);
pref("tags.marker", "");
pref("tags.separator", "keep");
pref("tags.stripSlashes", true);
pref("tags.stripSpecial", true);
pref("tags.dedupe", true);
pref("tags.mergeWithLibrary", true);
pref("tags.maxWords", 4);
pref("tags.maxLength", 40);
pref("tags.blacklist", "");
pref("tags.replacements", "");
pref("cleanup.maxTagsPerRequest", 150);
pref("cleanup.maxRequests", 3);
pref("cleanup.anchorCount", 20);
pref("cleanup.reviewed", "");
pref("cleanup.ignored", "");
pref("seedKeywords", "");
pref("finalPrompt", "");

pref("source.mode", "ai");
pref("source.openalex", true);
pref("source.openalexKey", "");
pref("source.openalexMinScore", "0.5");
pref("source.openalexSubfield", true);
pref("source.crossref", false);
pref("source.pubmed", false);
pref("source.local", true);
pref("source.localMax", 5);
pref("source.localOnlyFallback", true);
pref("source.contact", "");

pref("source.library", true);
pref("source.libraryK", 8);
pref("source.libraryMax", 6);
pref("source.libraryMinItems", 30);
pref("learn.enabled", true);
pref("learn.data", "");

pref("workflow.review", true);
pref("workflow.debug", false);
pref("ui.toolsMenu", true);
pref("ui.itemMenu", true);
pref("ui.tab", "general");
pref("ui.itemPane", true);

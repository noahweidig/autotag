export interface LLMProvider {
  name: string;
  generateTags(prompt: string): Promise<string>;
  /** Free-form JSON completion (any JSON shape). Used by the tag manager. */
  generateJson(prompt: string): Promise<string>;
  /** Returns model IDs available to the current credentials. */
  listModels(): Promise<string[]>;
}

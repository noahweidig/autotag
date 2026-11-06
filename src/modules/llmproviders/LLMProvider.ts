export interface LLMProvider {
  name: string;
  generateTags(prompt: string): Promise<string>;
  /** Returns model IDs available to the current credentials. */
  listModels(): Promise<string[]>;
}

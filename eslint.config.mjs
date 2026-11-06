// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  setTimeout: "readonly",
  Zotero: "readonly",
};

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  require: "readonly",
  module: "writable",
  __dirname: "readonly",
};

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      // Plain scripts loaded by Zotero into the pane / dialog windows
      files: ["addon/content/*.js"],
      languageOptions: { globals: browserGlobals },
    },
    {
      files: ["scripts/**/*.cjs"],
      languageOptions: { globals: nodeGlobals },
    },
  ],
});

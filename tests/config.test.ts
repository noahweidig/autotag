import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  getProviderInfo,
} from "../src/modules/llmproviders/providerInfo";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const declared = new Set(
  [...read("addon/prefs.js").matchAll(/pref\("([^"]+)"/g)].map((m) => m[1]),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("preferences", () => {
  it("every data-pref in the settings pane has a declared default", () => {
    const xhtml = read("addon/content/preferences.xhtml");
    const used = [...xhtml.matchAll(/data-pref="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((n) => !declared.has(n))).toEqual([]);
  });

  it("every pref read in source has a declared default", () => {
    const names = new Set<string>();
    for (const f of walk(join(root, "src")).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(
        /\b(?:getStr|getBool|getInt|setPrefRaw|getPrefRaw)\(\s*"([^"]+)"/g,
      )) {
        names.add(m[1]);
      }
    }
    expect(names.size).toBeGreaterThan(20);
    expect([...names].filter((n) => !declared.has(n))).toEqual([]);
  });

  it("each provider has key, model, and base URL prefs where used", () => {
    for (const p of PROVIDERS) {
      expect(declared.has(`model.${p.id}`)).toBe(true);
      if (p.needsKey) expect(declared.has(`apiKey.${p.id}`)).toBe(true);
      if (p.baseUrlEditable) expect(declared.has(`baseURL.${p.id}`)).toBe(true);
    }
  });

  it("pref ids are unique", () => {
    const all = [...read("addon/prefs.js").matchAll(/pref\("([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("providers", () => {
  it("ids are unique and defaults are valid", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) {
      if (p.presets.length) expect(p.presets).toContain(p.defaultModel);
      if (p.baseUrlDefault) expect(p.baseUrlDefault).toMatch(/^https?:\/\//);
      expect(p.baseUrlDefault.endsWith("/")).toBe(false);
    }
  });

  it("unknown ids fall back to the first provider", () => {
    expect(getProviderInfo("nope").id).toBe(PROVIDERS[0].id);
  });
});

describe("release metadata", () => {
  it("package.json and manifest.json versions match", () => {
    const pkg = JSON.parse(read("package.json"));
    const manifest = JSON.parse(read("addon/manifest.json"));
    expect(manifest.version).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("manifest icons exist", () => {
    const manifest = JSON.parse(read("addon/manifest.json"));
    for (const p of Object.values<string>(manifest.icons)) {
      expect(() => statSync(join(root, "addon", p))).not.toThrow();
    }
  });
});

describe("addon assets", () => {
  it("referenced chrome:// content files exist", () => {
    const files = [
      ...walk(join(root, "src")).filter((f) => f.endsWith(".ts")),
      ...walk(join(root, "addon/content")).filter((f) =>
        /\.(css|xhtml|js)$/.test(f),
      ),
    ];
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(
        /chrome:\/\/autotag\/content\/([\w./-]+)/g,
      )) {
        try {
          statSync(join(root, "addon/content", m[1]));
        } catch {
          missing.push(`${f}: ${m[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

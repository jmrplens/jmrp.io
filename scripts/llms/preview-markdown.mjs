/**
 * Offline preview of the MDX→markdown conversion.
 *
 * The Astro build takes ~85 s, which is far too slow a loop for writing sixty
 * component modules. This runs the very same renderer outside Vite by
 * scanning for `*.md.ts` itself instead of using `import.meta.glob`, which is
 * exactly why `buildRegistry()` takes the modules as an argument.
 *
 * Usage:
 *   node scripts/llms/preview-markdown.mjs en/004-enabling-quic-http3-nginx
 *   node scripts/llms/preview-markdown.mjs --all        # every published file
 *   node scripts/llms/preview-markdown.mjs --tags       # unhandled tag census
 */

import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import process from "node:process";

import { resolve as resolveAlias } from "./alias-hook.mjs";

// `registerHooks`, not `register`: the latter is deprecated in Node 25, and a
// synchronous in-thread hook is all a path-alias rewrite needs.
registerHooks({ resolve: resolveAlias });

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Every published MDX body, keyed by `<collection>/<locale>/<name>`. */
function corpus() {
  const files = [];
  for (const collection of ["posts", "tools"]) {
    for (const locale of ["en", "es"]) {
      const dir = path.join(ROOT, "src/content", collection, locale);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs
        .readdirSync(dir)
        .toSorted((a, b) => a.localeCompare(b))) {
        if (!file.endsWith(".mdx")) continue;
        if (file.startsWith("_") || file.startsWith("999")) continue;
        files.push({
          id: `${locale}/${file.replace(/\.mdx$/, "")}`,
          collection,
          locale,
          file: path.join(dir, file),
        });
      }
    }
  }
  return files;
}

/** Strips YAML frontmatter, which the collection loader removes in Astro. */
function body(file) {
  return fs.readFileSync(file, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
}

async function main() {
  const { buildRegistry, mdxToMarkdown } = await import(
    path.join(ROOT, "src/utils/llms/mdx/render.ts")
  );

  const modules = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md.ts")) modules[full] = full;
    }
  };
  walk(path.join(ROOT, "src/components"));
  for (const key of Object.keys(modules)) {
    modules[key] = await import(modules[key]);
  }
  const registry = buildRegistry(modules);

  const args = process.argv.slice(2);
  const files = corpus();

  /**
   * Which of the three census buckets a component falls into.
   *
   * @param {string} name - Component tag name.
   * @param {boolean} covered - Whether a registered ancestor owns this subtree.
   * @returns {"direct"|"ancestor"|"gap"} The bucket.
   */
  function bucketFor(name, covered) {
    if (registry.has(name)) return "direct";
    return covered ? "ancestor" : "gap";
  }

  if (args[0] === "--tags") {
    // Which components appear in the corpus, and which of them still have no
    // module. Counting tags left in the OUTPUT would report almost nothing,
    // because an unregistered component is silently replaced by its children:
    // its props are lost without leaving a trace to grep for.
    const { unified } = await import("unified");
    const remarkParse = (await import("remark-parse")).default;
    const remarkMdx = (await import("remark-mdx")).default;
    const processor = unified().use(remarkParse).use(remarkMdx);

    const seen = new Map();
    for (const entry of files) {
      const tree = processor.parse(body(entry.file));
      // `covered` tracks whether a registered ancestor already owns this
      // subtree. The 16 tool apps live inside <ToolApp>, which emits its own
      // text and their empty bodies, so reporting them as gaps would leave 16
      // permanently red rows and train the reader to ignore the census.
      const walk = (node, covered) => {
        let mine = covered;
        if (
          (node.type === "mdxJsxFlowElement" ||
            node.type === "mdxJsxTextElement") &&
          node.name &&
          /^[A-Z]/.test(node.name)
        ) {
          const bucket = bucketFor(node.name, covered);
          const key = `${bucket}:${node.name}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
          mine = covered || registry.has(node.name);
        }
        for (const child of node.children ?? []) walk(child, mine);
      };
      walk(tree, false);
    }

    const split = (bucket) =>
      [...seen]
        .filter(([key]) => key.startsWith(`${bucket}:`))
        .map(([key, n]) => [key.slice(bucket.length + 1), n])
        .sort((a, b) => b[1] - a[1]);
    const direct = split("direct");
    const ancestor = split("ancestor");
    const gaps = split("gap");
    const sum = (list) => list.reduce((n, [, c]) => n + c, 0);
    const total = sum(direct) + sum(ancestor) + sum(gaps);
    const covered = sum(direct) + sum(ancestor);
    console.log(
      `${direct.length} components with a module — ` +
        `${covered}/${total} usages covered ` +
        `(${((covered / total) * 100).toFixed(1)}%)`,
    );
    if (ancestor.length > 0) {
      console.log(
        `\ncovered by an ancestor's module (${sum(ancestor)} usages):`,
      );
      console.log(`  ${ancestor.map(([tag]) => tag).join(", ")}`);
    }
    console.log(`\nnot covered (${sum(gaps)} usages):`);
    if (gaps.length === 0) console.log("  none");
    for (const [tag, n] of gaps) {
      console.log(`  ${String(n).padStart(4)}  ${tag}`);
    }
    return;
  }

  if (args[0] === "--all") {
    let total = 0;
    for (const entry of files) {
      const out = mdxToMarkdown(body(entry.file), {
        locale: entry.locale,
        siteUrl: "https://jmrp.io",
        registry,
      });
      total += out.length;
      const dir = path.join(ROOT, ".cache/llms-preview", entry.collection);
      fs.mkdirSync(path.dirname(path.join(dir, `${entry.id}.md`)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(dir, `${entry.id}.md`), out);
    }
    console.log(`${files.length} files → .cache/llms-preview (${total} bytes)`);
    return;
  }

  const wanted = args[0];
  const entry = files.find((f) => f.id === wanted || f.id.endsWith(wanted));
  if (!entry) {
    console.error(`no match for "${wanted}". Known ids:`);
    for (const f of files) console.error(`  ${f.id}`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    mdxToMarkdown(body(entry.file), {
      locale: entry.locale,
      siteUrl: "https://jmrp.io",
      registry,
    }),
  );
}

await main();

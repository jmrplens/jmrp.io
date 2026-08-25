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
      const walk = (node) => {
        if (
          (node.type === "mdxJsxFlowElement" ||
            node.type === "mdxJsxTextElement") &&
          node.name &&
          /^[A-Z]/.test(node.name)
        ) {
          seen.set(node.name, (seen.get(node.name) ?? 0) + 1);
        }
        for (const child of node.children ?? []) walk(child);
      };
      walk(tree);
    }

    const rows = [...seen].sort((a, b) => b[1] - a[1]);
    const done = rows.filter(([tag]) => registry.has(tag));
    const todo = rows.filter(([tag]) => !registry.has(tag));
    const sum = (list) => list.reduce((n, [, c]) => n + c, 0);
    const total = sum(rows);
    console.log(
      `handled ${done.length}/${rows.length} components — ` +
        `${sum(done)}/${total} usages (${((sum(done) / total) * 100).toFixed(1)}%)`,
    );
    console.log("\nstill unhandled, by usage:");
    for (const [tag, n] of todo) {
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

/**
 * Guards for the published claims GEO audit #11 found false, checked against
 * the site's own sources rather than a build.
 *
 * - C1: llms-full.txt said the edge worker kept "no IP address and no session
 *   identifier" and called the measurement "self-hosted analytics", 24 days
 *   after /privacy/ and the worker had changed. The /privacy/ entry of
 *   `PROFILE_SECTIONS` is now pinned to the facts the page states.
 * - A1: five surfaces said all 17 tools run entirely in the browser; two of
 *   them make a network request about what you inspect. Every summary of the tools names both,
 *   and every count of the third-party requests a page makes names the
 *   certificate inspector, the one tool whose request leaves this domain.
 * - M1: the machine summaries kept a title the `#person` node had dropped.
 *   The fallback job title, the home title and the author card now read the
 *   profile's own `jobTitle` and `occupation`.
 */
// Half of the expected strings are Spanish, by design.
// cspell:locale es,en
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { load as loadYaml } from "js-yaml";

import { common as en } from "../../src/i18n/translations/en/common.ts";
import { common as es } from "../../src/i18n/translations/es/common.ts";
import {
  HOME_SECTIONS,
  PROFILE_SECTIONS,
  SITE_SECTIONS,
} from "../../src/utils/llms/sections.ts";

const ROOT = new URL("../../", import.meta.url);

/**
 * A repository file as text.
 * @param {string} path - Path from the repository root.
 * @returns {string} The file's contents.
 */
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

/**
 * The frontmatter `description` of an MDX page.
 * @param {string} path - Path from the repository root.
 * @returns {string} The description.
 */
function frontmatterDescription(path) {
  const match = /^---\n([\s\S]*?)\n---/u.exec(read(path));
  assert.ok(match, `${path} has no frontmatter`);
  return /** @type {{ description: string }} */ (loadYaml(match[1]))
    .description;
}

/** Words each locale uses for the two tools that reach the network. */
const NETWORKED = {
  en: [/certificate inspector/iu, /header analyzer/iu],
  es: [/inspector de certificados/iu, /analizador de cabeceras/iu],
};

/** Absolute claims about the tools that two of them contradict. */
const ABSOLUTE_TOOL_CLAIMS = {
  en: [
    /browser-only/iu,
    /entirely in the browser/iu,
    /never leaves your device/iu,
    /no server round-trips/iu,
    /all of them run client-side/iu,
    /on your own machine/iu,
    /no data is sent to any server/iu,
  ],
  es: [
    /por completo en el navegador/iu,
    /nunca sale de tu dispositivo/iu,
    /sin peticiones al servidor/iu,
    /se ejecutan en el cliente/iu,
    /en tu propia máquina/iu,
    /ningún dato se envía/iu,
    /herramientas de navegador/iu,
  ],
};

/** The /privacy/ lines of llms-full.txt for one locale, as one string. */
const privacySection = (locale) =>
  PROFILE_SECTIONS.find((s) => s.url === "/privacy/")[locale].lines.join(" ");

/** The page FAQ pairs of one locale, keyed by path. */
const pageFaq = (locale) =>
  new Map(
    loadYaml(read(`src/content/page_faq/${locale}.yaml`)).pages.map((p) => [
      p.path,
      p.items,
    ]),
  );

const about = loadYaml(read("src/content/profile/about.yaml"));

describe("privacy claims (C1)", () => {
  it("the page still says the edge worker records the server-log fields, IP included", () => {
    // If one of these fails, /privacy/ changed its account of the worker:
    // rewrite the /privacy/ entry of PROFILE_SECTIONS from the page, then
    // update the expectations below.
    const enPage = read("src/content/pages/en/privacy.mdx");
    const esPage = read("src/content/pages/es/privacy.mdx");
    assert.match(
      enPage,
      /records one row per request with the same data as the server logs/u,
    );
    assert.match(enPage, /access logs: timestamp, IP address/u);
    assert.match(
      enPage,
      /Page views are counted with Cloudflare Web Analytics/u,
    );
    assert.match(
      esPage,
      /con los mismos datos que los registros del servidor/u,
    );
    assert.match(esPage, /marca de tiempo, dirección IP/u);
    assert.match(esPage, /se cuentan con Cloudflare Web Analytics/u);
  });

  it("llms-full.txt states the same facts", () => {
    const enLines = privacySection("en");
    const esLines = privacySection("es");
    assert.match(enLines, /Cloudflare Web Analytics/u);
    assert.match(enLines, /IP address included/u);
    assert.match(esLines, /Cloudflare Web Analytics/u);
    assert.match(esLines, /dirección IP incluida/u);
  });

  it("no summary of /privacy/ says the analytics are self-hosted or IP-free", () => {
    const surfaces = [
      privacySection("en"),
      privacySection("es"),
      frontmatterDescription("src/content/pages/en/privacy.mdx"),
      frontmatterDescription("src/content/pages/es/privacy.mdx"),
      read("src/pages/og/[...slug].png.ts"),
    ];
    for (const text of surfaces) {
      for (const stale of [
        /self-hosted analytics/iu,
        /analítica autoalojada/iu,
        /analítica autoalojado/iu,
        /no IP address/iu,
        /sin dirección IP/iu,
        /aggregate row/iu,
        /fila agregada/iu,
        /session identifier/iu,
        /identificador de sesión/iu,
      ]) {
        assert.doesNotMatch(text, stale);
      }
    }
  });
});

describe("tool claims (A1)", () => {
  for (const locale of /** @type {const} */ (["en", "es"])) {
    const common = locale === "en" ? en : es;
    const faq = pageFaq(locale);
    const summaries = {
      "pages.tools.intro": common.pages.tools.intro,
      "pages.tools.description": common.pages.tools.description,
      "HOME_SECTIONS /tools/": HOME_SECTIONS.find((s) => s.path === "/tools/")
        .note[locale],
      "SITE_SECTIONS /tools/": SITE_SECTIONS.find((s) => s.path === "/tools/")[
        locale
      ].description,
      "home FAQ": faq
        .get("/")
        .map((item) => item.answer)
        .join(" "),
    };

    it(`${locale}: every summary of the tools names the networked ones`, () => {
      for (const [where, text] of Object.entries(summaries)) {
        // The meta description has room only for "two of them"; the rest
        // name both tools.
        if (where === "pages.tools.description") {
          assert.match(text, locale === "en" ? /\btwo\b/u : /\bdos\b/u, where);
          continue;
        }
        for (const name of NETWORKED[locale]) assert.match(text, name, where);
      }
    });

    it(`${locale}: every count of third-party requests names the certificate inspector`, () => {
      // "The only third-party request a page makes is the beacon's report"
      // was false on /tools/cert-inspector/, which asks a Certificate
      // Transparency log from the browser once its button is pressed.
      const request =
        locale === "en" ? /third-party request/iu : /petición a un tercero/iu;
      const page = read(`src/content/pages/${locale}/privacy.mdx`);
      const passages = [
        ...page.split(/\n{2,}/u),
        ...[...faq.values()].flat().map((item) => item.answer),
      ].filter((text) => !text.startsWith("#") && request.test(text));
      assert.ok(passages.length >= 2, "the count moved; find it again");
      for (const text of passages) {
        assert.match(text, NETWORKED[locale][0], text);
      }
    });

    it(`${locale}: no source repeats an absolute claim about all the tools`, () => {
      const sources = {
        "common.ts": JSON.stringify(common),
        page_faq: JSON.stringify([...faq.values()]),
        "about.yaml": JSON.stringify(about[locale]),
        "sections.ts": JSON.stringify([
          PROFILE_SECTIONS.map((s) => s[locale]),
          SITE_SECTIONS.map((s) => s[locale]),
          HOME_SECTIONS.map((s) => s.note?.[locale]),
        ]),
      };
      for (const [where, text] of Object.entries(sources)) {
        for (const claim of ABSOLUTE_TOOL_CLAIMS[locale]) {
          assert.doesNotMatch(text, claim, where);
        }
      }
    });
  }
});

describe("positioning (M1)", () => {
  for (const locale of /** @type {const} */ (["en", "es"])) {
    const common = locale === "en" ? en : es;
    const { jobTitle, occupation } = about.person;

    it(`${locale}: the fallback title and the author card follow the profile`, () => {
      assert.equal(common.seo.jobTitle, jobTitle[locale]);
      assert.equal(common.pages.blogPost.authorRole, occupation[locale]);
      assert.equal(
        common.seo.siteTitle,
        `José Manuel Requena Plens | ${occupation[locale]}`,
      );
      assert.equal(
        common.pages.cv.schemaDescription,
        about.person.description[locale],
      );
    });

    it(`${locale}: the home title fits in 65 characters, the descriptions in 155`, () => {
      // The home page passes `seo.siteTitle` as its title, which BaseHead
      // prints untruncated.
      assert.ok(common.seo.siteTitle.length <= 65, common.seo.siteTitle);
      for (const text of [
        common.seo.siteDescription,
        common.pages.cv.description,
        common.pages.blog.description,
        common.pages.tools.description,
        frontmatterDescription(`src/content/pages/${locale}/privacy.mdx`),
      ]) {
        assert.ok(text.length <= 155, `${text.length}: ${text}`);
      }
    });
  }
});

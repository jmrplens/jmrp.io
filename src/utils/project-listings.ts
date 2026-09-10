/**
 * Where a project is listed, resolved from its URLs.
 *
 * `projects.yaml` already holds every third-party URL a project has, split by
 * INTENT rather than by kind: `listings` are the two or three worth a rendered
 * card link, `sameAs` is the long tail that existed only as JSON-LD identity
 * signal. That tail is real, checkable information a reader may want ("is this
 * on Docker Hub? is there a DOI?") and until now nothing on the page showed
 * it, so /projects/ renders it behind one popover per card.
 *
 * ── Why labels are derived, not authored ─────────────────────────────────
 * `listings` carries a hand-written `label`/`icon` per entry because those
 * three are rendered as prose-sized card links. Doing the same for the tail
 * would mean authoring ~24 more label/icon pairs, most of them repeated across
 * projects (both MCP servers are on the same nine directories), and the second
 * copy is where a rename drifts. The host already identifies the site, so one
 * map keyed by host answers it for every project at once, and a host nobody
 * has mapped yet degrades to its own name plus a generic link glyph instead of
 * breaking the card.
 */
import type { Project } from "@utils/projects";

/** A site that lists software, as recognized from a URL. */
interface Directory {
  /**
   * Proper noun of the site. Omitted when the host IS the name people use
   * for it (`mcp.so`), in which case the host is shown verbatim.
   *
   * Not translated, and not a translation key: these are brand names, and the
   * `listings` labels already authored in `projects.yaml` are English-only for
   * the same reason (see the `label` field's own schema docs).
   */
  label?: string;
  /** Bare Iconify id, `collection:name`, as in `projects.yaml`. */
  icon: string;
}

/**
 * Every host the projects are listed on, keyed by host with `www.` stripped.
 *
 * A key MAY carry a path prefix (`host/first/second`) for the case where the
 * host alone is the wrong answer: the WinGet manifests live inside Microsoft's
 * own `winget-pkgs` repository, so `github.com` would label them "GitHub" and
 * send the reader looking for a package index. Longest key wins, so the bare
 * `github.com` entry stays as the fallback for any other GitHub URL.
 *
 * `www.` is stripped before lookup because it is a hosting accident, not part
 * of the site's identity: npmjs.com and mathworks.com are authored with it,
 * pypi.org and glama.ai without, and a future URL that drops or adds it should
 * not silently fall through to the unmapped case.
 *
 * Each entry carries its own brand mark, because a column of sixteen rows all
 * wearing the same glyph gives a reader nothing to aim at. Marks come from
 * Iconify where Iconify has them, and otherwise from the local `vendored`
 * collection (`src/icons/vendored/`, provenance recorded alongside). Only two
 * hosts publish no vector mark at all and keep the generic directory glyph;
 * see the note on them below.
 */
const DIRECTORIES: Readonly<Record<string, Directory>> = {
  // Package indexes: "how do I install this".
  "npmjs.com": { label: "npm", icon: "simple-icons:npm" },
  "pypi.org": { label: "PyPI", icon: "simple-icons:pypi" },
  "nuget.org": { label: "NuGet", icon: "simple-icons:nuget" },
  "hub.docker.com": { label: "Docker Hub", icon: "simple-icons:docker" },
  "github.com/microsoft/winget-pkgs": {
    label: "WinGet",
    icon: "mdi:microsoft-windows",
  },
  "mathworks.com": {
    label: "MATLAB Central",
    icon: "vscode-icons:file-type-matlab",
  },
  "app.crowdsec.net": { label: "CrowdSec Hub", icon: "mdi:shield-check" },

  // Archived deposit: a persistent identifier, not a page that can be
  // renamed. The generic DOI mark is deliberate even though this one resolves
  // to Zenodo: the host is doi.org, and only resolving it would tell us the
  // registrar, so claiming Zenodo here would be a guess.
  "doi.org": { label: "DOI", icon: "simple-icons:doi" },

  // Audits the live endpoint, not the repository (see the note on this URL in
  // projects.yaml), so it gets its own mark.
  "verifymcp.io": { label: "VerifyMCP", icon: "mdi:check-decagram" },

  // MCP catalogues. Each carries its own mark: Cursor's is in `simple-icons`,
  // the rest are in the local `vendored` collection because Iconify has none
  // of them (`thesvg` has Glama and LobeHub, but pulling a 3752-icon package
  // in for two icons is not worth it, so those two are vendored from the same
  // upstream SVG). `src/icons/vendored/provenance.json` records where each
  // file came from and what was changed.
  "cursor.directory": {
    label: "Cursor Directory",
    icon: "simple-icons:cursor",
  },
  "glama.ai": { label: "Glama", icon: "vendored:glama" },
  "mcp.so": { icon: "vendored:mcpso" },
  "pulsemcp.com": { label: "PulseMCP", icon: "vendored:pulsemcp" },
  "pickmcp.com": { label: "PickMCP", icon: "vendored:pickmcp" },
  "mcpvault.io": { label: "MCP Vault", icon: "vendored:mcpvault" },
  // LobeHub ships an official monochrome-grayscale variant of its character in
  // its own MIT-licensed icon library, which keeps the eyes and mouth a
  // silhouette had thrown away. It is multi-tone, so unlike every other icon
  // here it renders as a background image and does NOT follow the theme; see
  // its provenance entry.
  "lobehub.com": { label: "LobeHub", icon: "vendored:lobehub" },
  // Reconstructed from the official raster, pixel-measured rather than drawn.
  "mcpservers.org": { label: "MCP Servers", icon: "vendored:mcpservers" },
  // The last one on the generic directory glyph: it publishes no vector mark,
  // and the author confirmed leaving it. See `leftOnGenericIcon`.
  "mcptoplist.com": { label: "MCP Toplist", icon: "mdi:view-grid-outline" },

  // Fallback for any other GitHub URL; kept last of the github.com keys only
  // for reading order, the lookup sorts by length, not by position.
  "github.com": { label: "GitHub", icon: "fa-brands:github" },
};

/**
 * What an unmapped host gets: its own name (filled in by the caller) and a
 * neutral link glyph. A new `sameAs` entry therefore renders correctly the day
 * it is authored, and only loses the proper noun until someone maps it.
 *
 * Like every icon in the map above, it reaches the CSS through the `safelist`
 * entry uno.config.ts derives from THIS file: the consumer builds the class at
 * runtime as `i-${icon}`, so no extractor ever sees it in a source file.
 */
const UNMAPPED: Directory = { icon: "mdi:link-variant" };

/**
 * How many path segments the longest key in `DIRECTORIES` carries. Derived
 * rather than written down so adding a deeper key needs no second edit.
 */
const MAX_KEY_DEPTH = Math.max(
  ...Object.keys(DIRECTORIES).map((key) => key.split("/").length - 1),
);

/** A host with the `www.` prefix removed. See `DIRECTORIES`. */
const bareHost = (host: string): string => host.replace(/^www\./, "");

/**
 * Resolves the directory entry for a URL, preferring the most specific key.
 *
 * @param url - The parsed listing URL.
 * @returns The mapped entry, or the unmapped fallback.
 */
function directoryFor(url: URL): Directory {
  const host = bareHost(url.host);
  const segments = url.pathname.split("/").filter(Boolean);
  for (
    let depth = Math.min(segments.length, MAX_KEY_DEPTH);
    depth > 0;
    depth--
  ) {
    const hit = DIRECTORIES[`${host}/${segments.slice(0, depth).join("/")}`];
    if (hit) return hit;
  }
  return DIRECTORIES[host] ?? UNMAPPED;
}

/** One place a project is listed, ready to render. */
export interface ProjectListing {
  url: string;
  /** Proper noun of the site, or its bare host when nothing is mapped. */
  label: string;
  /** Bare Iconify id; the consumer prefixes it with `i-`. */
  icon: string;
  /** Bare host, shown as secondary text when it is not already the label. */
  host: string;
  /**
   * Whether this URL is also one of the card's rendered `listings` links.
   *
   * Those are NOT filtered out. The popover answers "everywhere this project
   * is listed", and a list that silently dropped npm because npm happened to
   * be on the card would answer that question wrongly for the reader most
   * likely to be asking it. They are marked instead, so the popover stays
   * complete and the duplication is explained rather than hidden.
   */
  onCard: boolean;
}

/**
 * Sort key for one listing: the lowercased visible LABEL.
 *
 * The label is what the reader scans, so it is what the order has to follow;
 * sorting by host would put "npmjs.com" under N and "mcp.so" under M while the
 * rows read "npm" and "mcp.so", and sorting by YAML order is no order at all.
 *
 * @param listing - The listing to key.
 * @returns The comparison key.
 */
const sortKey = (listing: ProjectListing): string =>
  listing.label.toLowerCase();

/**
 * Every directory and registry a project is listed on, ordered for reading:
 * the entries the card already links first, then the rest, each group
 * alphabetical by visible label.
 *
 * ── Why this order cannot drift ──────────────────────────────────────────
 * The comparison is plain code-unit `<` on a `toLowerCase()`d label, NOT
 * `localeCompare` and not `Intl.Collator`: those two read the runtime's
 * default locale, so the same list could come out in one order on /projects/
 * and another on /es/projects/, or change under a build host with a different
 * `LANG`. Code-unit order on ASCII is total, deterministic and locale-free,
 * and every label is ASCII because they are proper nouns that are never
 * translated (see `Directory.label`). `toLowerCase` is locale-independent by
 * spec, unlike `toLocaleLowerCase`, so it cannot introduce a Turkish-i style
 * difference either. Ties are impossible: two entries with the same label
 * would be the same directory, and the URL set is deduplicated below.
 *
 * Deliberately NOT included is the MCP Registry alias that
 * `buildProjectSchema` synthesizes from `registryId`. It is the one alias with
 * no page behind it: its only per-server URL is a `/versions` API response, so
 * a reader who followed it would land on raw JSON. It stays a JSON-LD
 * `identifier`, which is what `registryId`'s schema docs already say it is.
 *
 * Deduplicated by URL so a URL mistakenly authored under both fields appears
 * once (the YAML rules forbid that, and nothing enforces them).
 *
 * @param project - The project as authored in `projects.yaml`.
 * @returns The listings, or an empty array when the project has none.
 */
export function projectListings(project: Project): ProjectListing[] {
  const rendered = project.listings ?? [];
  const onCard = new Set(rendered.map((listing) => listing.url));
  const urls = [...new Set([...onCard, ...(project.sameAs ?? [])])];

  return urls
    .map((url) => {
      // Safe to parse unguarded: the collection schema validates every one of
      // these fields with `z.url()`, so an unparseable URL fails the build.
      const parsed = new URL(url);
      const directory = directoryFor(parsed);
      const host = bareHost(parsed.host);
      return {
        url,
        label: directory.label ?? host,
        icon: directory.icon,
        host,
        onCard: onCard.has(url),
      };
    })
    .sort((a, b) => {
      // The card's own links first: those are the rows a reader arrives
      // already knowing, so they belong at the top rather than scattered
      // through the alphabet with a "shown on the card" mark to hunt for.
      if (a.onCard !== b.onCard) return a.onCard ? -1 : 1;
      const [ka, kb] = [sortKey(a), sortKey(b)];
      if (ka < kb) return -1;
      return ka > kb ? 1 : 0;
    });
}

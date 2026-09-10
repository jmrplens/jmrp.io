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
 * The icon says what KIND of listing it is, which is the distinction a reader
 * scanning sixteen unfamiliar names actually needs: a brand mark for the
 * package indexes you install from, a check seal for VerifyMCP (which audits
 * the running endpoint rather than listing a repository), the DOI mark for the
 * archived deposit, and one shared directory glyph for the MCP catalogues,
 * which differ only in name. That glyph is the one `projects.yaml` already
 * authors for Glama.
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

  // MCP catalogues. Cursor is the one with a mark of its own.
  "cursor.directory": {
    label: "Cursor Directory",
    icon: "simple-icons:cursor",
  },
  "glama.ai": { label: "Glama", icon: "mdi:view-grid-outline" },
  "mcp.so": { icon: "mdi:view-grid-outline" },
  "lobehub.com": { label: "LobeHub", icon: "mdi:view-grid-outline" },
  "pulsemcp.com": { label: "PulseMCP", icon: "mdi:view-grid-outline" },
  "mcpservers.org": { label: "MCP Servers", icon: "mdi:view-grid-outline" },
  "pickmcp.com": { label: "PickMCP", icon: "mdi:view-grid-outline" },
  "mcpvault.io": { label: "MCP Vault", icon: "mdi:view-grid-outline" },
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
 * Every directory and registry a project is listed on, in authored order:
 * the rendered `listings` first, then the `sameAs` tail.
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

  return urls.map((url) => {
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
  });
}

/**
 * The bilingual section tables the llms.txt documents are built from.
 *
 * Data, not logic: each entry is one page's title and prose in both languages,
 * written by hand. They live apart from `@utils/llms` for two reasons. The
 * shape `{ en: {...}, es: {...} }` repeats once per entry by construction, so
 * a copy-paste detector reads a hand-written bilingual table as duplication —
 * the same reason `src/i18n/translations/**` is already excluded from CPD.
 * Keeping them here means that exclusion can name this file precisely, and the
 * renderers in `@utils/llms` stay under the detector where they belong.
 *
 * @module
 */
// cspell:locale es,en — half of every entry is Spanish by design.

/**
 * Site sections that `llms.txt` advertises under "## Sections" but that
 * `llms-full.txt` used to omit entirely.
 *
 * The index promised Homelab, Projects, Uses and Privacy; the full document
 * expanded only About, Blog, Tools, CV and Publications, so a model that
 * followed the index into the full file found nothing for four of them —
 * including /privacy/, which carries some of the most quotable prose on the
 * site because its claims are falsifiable rather than promotional.
 *
 * The home page and /about/ were the last two gaps, and the worst of them:
 * /about/ is the author-entity page — the one a model reads to answer who
 * this person is — and neither it nor its twin appeared anywhere in the full
 * document, in either language.
 *
 * Written as standing facts rather than generated from the pages: /homelab/'s
 * figures are live metrics that would be stale the moment they were written
 * into a static document, and stating a number here that the page no longer
 * shows would be worse than stating none.
 */
export const PROFILE_SECTIONS: {
  url: string;
  en: { title: string; lines: string[] };
  es: { title: string; lines: string[] };
}[] = [
  {
    url: "/",
    en: {
      title: "Home",
      lines: [
        "Orientation page: who the author is, and where everything on the site lives. Its markdown twin is a map — every section with its own twin listed beside it — so an agent can reach the whole site in markdown without parsing one page of HTML.",
      ],
    },
    es: {
      title: "Inicio",
      lines: [
        "Página de orientación: quién es el autor y dónde vive cada cosa del sitio. Su gemelo markdown es un mapa —cada sección con su propio gemelo al lado—, así que un agente alcanza el sitio entero en markdown sin analizar una sola página de HTML.",
      ],
    },
  },
  {
    url: "/about/",
    en: {
      title: "About",
      lines: [
        "The author-entity page: biography, what he builds and writes about, the featured open-source projects with their technologies and metrics, education, and the editorial & corrections policy that every post's AI-assistance disclosure links to.",
        "This is the page to read to answer who José Manuel Requena Plens is or what he builds; the canonical Person node it anchors is published separately at /identity/person.jsonld.",
      ],
    },
    es: {
      title: "Sobre mí",
      lines: [
        "La página de entidad del autor: biografía, qué construye y sobre qué escribe, los proyectos open source destacados con sus tecnologías y métricas, la formación y la política editorial y de correcciones a la que enlaza la nota de asistencia por IA de cada entrada.",
        "Es la página que hay que leer para responder quién es José Manuel Requena Plens o qué construye; el nodo Person canónico que ancla se publica aparte en /identity/person.jsonld.",
      ],
    },
  },
  {
    url: "/projects/",
    en: {
      title: "Projects",
      lines: [
        "Open-source software authored and maintained by the author, each entry listing language, license, source repository and documentation site.",
        "Includes: gitlab-mcp-server (Model Context Protocol server exposing over 1,000 GitLab operations to AI assistants, Go), phonometry (Python acoustics library validated against 367 standards), cs-routeros-bouncer (CrowdSec bouncer for MikroTik RouterOS, Go), Cloudflare-DNS-Updater (dynamic DNS updater), libgen-mcp, and TFG-TFM_EPS (LaTeX thesis template for the Universitat Politècnica de València).",
        "Both MCP servers also run as public hosted endpoints at mcp.jmrp.io, so a client can call them without building or installing anything.",
      ],
    },
    es: {
      title: "Proyectos",
      lines: [
        "Software de código abierto escrito y mantenido por el autor; cada entrada indica lenguaje, licencia, repositorio de código y sitio de documentación.",
        "Incluye: gitlab-mcp-server (servidor Model Context Protocol que expone más de 1.000 operaciones de GitLab a asistentes de IA, en Go), phonometry (biblioteca de acústica en Python validada contra 367 normas publicadas), cs-routeros-bouncer (bouncer de CrowdSec para MikroTik RouterOS, en Go), Cloudflare-DNS-Updater (actualizador de DNS dinámico), libgen-mcp y TFG-TFM_EPS (plantilla LaTeX de tesis para la Universitat Politècnica de València).",
        "Los dos servidores MCP corren además como endpoints públicos alojados en mcp.jmrp.io, así que un cliente puede llamarlos sin compilar ni instalar nada.",
      ],
    },
  },
  {
    url: "/homelab/",
    en: {
      title: "Homelab",
      lines: [
        "Self-hosted infrastructure run by the author on his own hardware and connections, with live metrics on the page.",
        "Services include a Mastodon instance (mstdn.jmrp.io), a Matrix homeserver, an AT Protocol PDS, Home Assistant, Immich, Jellyfin, and monitoring.",
        "Model Context Protocol servers are published at mcp.jmrp.io, running on the same infrastructure: libgen (no credentials) and gitlab (per-request token).",
        "Tor: four nodes — two bridges running obfs4 and WebTunnel, one in Valencia and one in Alicante, and two middle relays on IONOS VPS instances, one in London and one in Madrid.",
        "Security pipeline: a MikroTik honeypot and nginx pattern matching feed CrowdSec, which drives bouncers on the router and the web tier.",
      ],
    },
    es: {
      title: "Homelab",
      lines: [
        "Infraestructura autoalojada que el autor opera sobre su propio hardware y sus propias conexiones, con métricas en tiempo real en la página.",
        "Entre los servicios hay una instancia de Mastodon (mstdn.jmrp.io), un homeserver de Matrix, un PDS de AT Protocol, Home Assistant, Immich, Jellyfin y monitorización.",
        "Los servidores Model Context Protocol se publican en mcp.jmrp.io, sobre la misma infraestructura: libgen (sin credenciales) y gitlab (token por petición).",
        "Tor: cuatro nodos — dos puentes que ejecutan obfs4 y WebTunnel, uno en Valencia y otro en Alicante, y dos relays intermedios en VPS de IONOS, uno en Londres y otro en Madrid.",
        "Tubería de seguridad: un honeypot en MikroTik y la coincidencia de patrones de nginx alimentan a CrowdSec, que a su vez acciona los bouncers del router y de la capa web.",
      ],
    },
  },
  {
    url: "/uses/",
    en: {
      title: "Uses",
      lines: [
        "The hardware, software and services actually in rotation: router and network gear, servers and mini PCs, development tools, and the self-hosted services listed under Homelab.",
      ],
    },
    es: {
      title: "Uses",
      lines: [
        "El hardware, el software y los servicios que están realmente en uso: router y equipamiento de red, servidores y mini PCs, herramientas de desarrollo y los servicios autoalojados que aparecen en Homelab.",
      ],
    },
  },
  {
    url: "/privacy/",
    en: {
      title: "Privacy",
      lines: [
        "No cookies, no third-party scripts, no advertising network, no cross-site tracking, and no mailing list.",
        "The only measurement is a privacy-preserving analytics beacon; the page invites the reader to verify the claim directly by opening the browser storage panel and finding nothing to delete.",
        "Nothing on the site is monetized: no advertising, no affiliate links and no sponsored content, stated explicitly as a conflict-of-interest declaration.",
      ],
    },
    es: {
      title: "Privacidad",
      lines: [
        "Sin cookies, sin scripts de terceros, sin red publicitaria, sin rastreo entre sitios y sin lista de correo.",
        "La única medición es un beacon de analítica respetuoso con la privacidad; la página invita a comprobarlo abriendo el panel de almacenamiento del navegador y no encontrando nada que borrar.",
        "Nada del sitio está monetizado: ni publicidad, ni enlaces de afiliado, ni contenido patrocinado, declarado explícitamente como conflicto de intereses.",
      ],
    },
  },
];

/**
 * The site's landing pages, and what each one is for.
 *
 * One table instead of two hand-written blocks: the EN and ES versions were
 * twenty separate template literals that had to be edited in pairs, and the
 * EN half silently omitted the home page that the ES half listed. Whether an
 * entry also advertises a markdown twin is read from {@link TWINNED_PAGES},
 * not written here, so the index can never announce an `index.md` that has no
 * route behind it.
 */
export const SITE_SECTIONS: {
  path: string;
  en: { title: string; description: string };
  es: { title: string; description: string };
}[] = [
  {
    path: "/",
    en: {
      title: "Home",
      description: "The whole site in one orientation page",
    },
    es: {
      title: "Inicio",
      description: "Versión en español del sitio completo",
    },
  },
  {
    path: "/blog/",
    en: {
      title: "Blog",
      description:
        "Technical articles on Nginx, MikroTik, networking, security, embedded firmware, and DevOps",
    },
    es: {
      title: "Blog",
      description:
        "Artículos técnicos sobre Nginx, MikroTik, redes, seguridad, firmware embebido y DevOps",
    },
  },
  {
    path: "/about/",
    en: {
      title: "About",
      description:
        "Who José Manuel Requena Plens is — firmware & software engineer, background, featured open-source projects, and the editorial & corrections policy",
    },
    es: {
      title: "Perfil",
      description:
        "Quién es José Manuel Requena Plens — ingeniero de firmware y software, trayectoria, proyectos destacados y la política editorial y de correcciones",
    },
  },
  {
    path: "/cv/",
    en: {
      title: "CV",
      description: "Professional curriculum vitae and experience",
    },
    es: { title: "CV", description: "Currículum profesional y experiencia" },
  },
  {
    path: "/publications/",
    en: {
      title: "Publications",
      description:
        "Academic papers on acoustics, metamaterials, and ultrasound",
    },
    es: {
      title: "Publicaciones",
      description:
        "Artículos académicos sobre acústica, metamateriales y ultrasonidos",
    },
  },
  {
    path: "/homelab/",
    en: {
      title: "Homelab",
      description:
        "Self-hosted infrastructure — Mastodon, Matrix, AT Protocol PDS, MCP servers, Tor relays",
    },
    es: {
      title: "Homelab",
      description:
        "Infraestructura autoalojada — Mastodon, Matrix, PDS de AT Protocol, servidores MCP, relés Tor",
    },
  },
  {
    path: "/projects/",
    en: {
      title: "Projects",
      description:
        "Curated open-source software he authors and maintains — MCP servers, acoustics tooling, network security; language, license, source and docs per project",
    },
    es: {
      title: "Proyectos",
      description:
        "Software libre que escribe y mantiene — servidores MCP, herramientas de acústica, seguridad de red",
    },
  },
  {
    path: "/tools/",
    en: {
      title: "Tools",
      description:
        "Free browser-based developer tools; all run in the browser except the certificate inspector and HTTP header analyzer, which fetch the target you ask them to inspect",
    },
    es: {
      title: "Herramientas",
      description:
        "Herramientas gratuitas que se ejecutan en el navegador, salvo el inspector de certificados y el analizador de cabeceras HTTP, que consultan el destino que les indiques",
    },
  },
  {
    path: "/feeds/",
    en: {
      title: "Feeds",
      description:
        "RSS feed URLs for both languages, plus the eight curated Bluesky feeds the author runs",
    },
    es: {
      title: "Feeds",
      description:
        "URLs de los feeds RSS en ambos idiomas, más los ocho feeds curados de Bluesky que mantiene el autor",
    },
  },
  {
    path: "/uses/",
    en: {
      title: "Uses",
      description: "Hardware, software, and homelab kept in rotation",
    },
    es: {
      title: "Uses",
      description: "Hardware, software e infraestructura en uso",
    },
  },
  {
    path: "/privacy/",
    en: {
      title: "Privacy",
      description:
        "What the site measures — self-hosted analytics beacon, no cookies, no ads; rendering a page needs no third-party host, and the beacon posts one aggregate event to Cloudflare",
    },
    es: {
      title: "Privacidad",
      description:
        "Qué mide el sitio — beacon de analítica autoalojado, sin cookies, sin anuncios; renderizar una página no requiere ningún host de terceros, y el beacon envía un evento agregado a Cloudflare",
    },
  },
];

/**
 * Sections the homepage sends a visitor to.
 *
 * Whether each one also has a markdown twin is NOT written here: it is read
 * from {@link TWINNED_PAGES}, the single list that also drives llms.txt and
 * llms-full.txt. This entry used to carry its own boolean, which is how
 * /blog/ and /tools/ went on being described as twin-less for months after
 * the routes existed — and how /homelab/ would have been announced with a
 * twin that 404s.
 *
 * The optional `note` says what a bare URL cannot: that a listing's items are
 * the documents worth fetching, or why a page has no twin at all.
 */
export const HOME_SECTIONS: {
  path: string;
  title: { en: string; es: string };
  note?: { en: string; es: string };
}[] = [
  {
    path: "/blog/",
    title: { en: "Blog", es: "Blog" },
    note: {
      en: "Listing page. Every post publishes its own markdown twin, and llms.txt lists them all.",
      es: "Página de listado. Cada entrada publica su propio gemelo markdown, y llms.txt los lista todos.",
    },
  },
  {
    path: "/blog/series/",
    title: { en: "Series", es: "Series" },
    note: {
      en: "Curated reading paths: why a cluster of posts exists and in what order to read it.",
      es: "Itinerarios de lectura curados: por qué existe un grupo de entradas y en qué orden leerlo.",
    },
  },
  {
    path: "/tools/",
    title: { en: "Tools", es: "Herramientas" },
    note: {
      en: "Listing page. Every tool publishes its own markdown twin with the full documentation, and all of them run client-side.",
      es: "Página de listado. Cada herramienta publica su propio gemelo markdown con la documentación completa, y todas se ejecutan en el cliente.",
    },
  },
  { path: "/projects/", title: { en: "Projects", es: "Proyectos" } },
  {
    path: "/publications/",
    title: { en: "Publications", es: "Publicaciones" },
  },
  { path: "/cv/", title: { en: "CV", es: "CV" } },
  { path: "/uses/", title: { en: "Uses", es: "Uses" } },
  { path: "/about/", title: { en: "About", es: "Sobre mí" } },
  { path: "/feeds/", title: { en: "Feeds", es: "Feeds" } },
  {
    path: "/homelab/",
    title: { en: "Homelab", es: "Homelab" },
    note: {
      en: "Its twin ships the metric placeholders rather than values: nginx substitutes them as the document is served, so the markdown carries the same live figures as the page and is never cached.",
      es: "Su gemelo lleva los marcadores de las métricas en vez de los valores: nginx los sustituye al servir el documento, así que el markdown trae las mismas cifras vivas que la página y no se cachea nunca.",
    },
  },
  { path: "/privacy/", title: { en: "Privacy", es: "Privacidad" } },
];

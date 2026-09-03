/**
 * English translations — common UI strings.
 *
 * Covers navigation, layout, ARIA labels, and shared UI elements.
 * Keys follow dot-notation convention: `t("nav.home")`.
 */
export const common = {
  nav: {
    home: "Home",
    blog: "Blog",
    tools: "Tools",
    cv: "CV",
    publications: "Publications",
    projects: "Projects",
    homelab: "Homelab",
    about: "About",
    uses: "Uses",
    privacy: "Privacy",
    license: "License",
    contact: "Contact",
  },
  menu: {
    drawerLabel: "Navigation menu",
    youAreHere: "you are here",
    recent: "recent posts",
    tags: "tags",
    available: "available",
  },
  terminal: {
    inputLabel: "Navigation command",
    outputLabel: "Terminal output",
    inputPlaceholder: "help",
    hintType: "type",
    hintHistory: "history",
    resetHome: "↺ home",
    emptyDir: "empty",
    noResults: "no results for",
    notFound: "command not found",
    typeHelp: "type help",
    location: "Valencia, ES (UTC+1)",
    blocked: "permission denied — nice try",
    usage: "usage",
    nedryDenied: "ACCESS DENIED",
    nedrySound: "with sound",
    nedryBack: "back to menu",
    nedryAria:
      "Dennis Nedry wagging his finger — you didn't say the magic word",
    groupNav: "navigation",
    groupDiscover: "discover",
    groupIdentity: "identity",
    groupSystem: "system",
    labelRole: "role",
    labelBase: "base",
    labelStack: "stack",
    labelOrg: "org",
    labelPosts: "posts",
    labelTags: "tags",
    desc: {
      help: "list commands",
      tree: "section tree",
      ls: "list current dir",
      cd: "enter a directory",
      pwd: "current path",
      find: "search posts & pages",
      recent: "latest posts",
      tags: "all tags",
      sitemap: "full site map",
      whoami: "identity summary",
      neofetch: "system card",
      social: "profiles & links",
      history: "previous commands",
      man: "help for a command",
      open: "navigate to a path",
      theme: "toggle theme",
      lang: "switch language",
      clear: "reset to tree",
      exit: "close menu",
    },
  },
  ui: {
    skipToContent: "Skip to content",
    readMore: "Read more",
    backTo: "← Back to {page}",
    viewAll: "View all {items} →",
    loading: "Loading...",
    error: "An error occurred",
    noResults: "No results found.",
    search: "Search",
    close: "Close",
    open: "Open",
    download: "Download",
    lines: "lines",
    copy: "Copy",
    copied: "Copied",
    commands: "Commands",
    output: "output",
    language: "Language",
    english: "English",
    spanish: "Español",
    switchLanguage: "Switch to {lang}",
    copyright: "© {year} {author}",
  },
  aria: {
    mainNav: "Main Navigation",
    toggleNav: "Toggle Navigation",
    toggleTheme: "Toggle theme",
    switchToDark: "Switch to dark theme",
    switchToLight: "Switch to light theme",
    breadcrumb: "Breadcrumb",
    tableOfContents: "Table of Contents",
    tocDrawer: "Table of Contents Drawer",
    close: "Close",
    copyToClipboard: "Copy to clipboard",
    copied: "Copied!",
    visitProfile: "Visit my {name} profile",
    viewTaggedPosts: "View all posts tagged with {tag}",
    readArticle: "Read article: {title}",
    opensNewTab: "{text} (opens in new tab)",
    showTab: "Show {label} tab",
    calloutType: "{type} callout",
    stepByStep: "Step-by-step guide",
    checklist: "Checklist",
    codeContent: "Code content for {filename}",
    comparison: "Comparison: {before} vs {after}",
    mdnDocs: "MDN documentation for {name}",
    authRequired: "Authentication required",
    playSoundNedry: "Play Nedry sound",
    languageSwitcher: "Switch language",
    postsGrid: "Blog posts grid",
    openCVMenu: "Open CV Menu",
    closeMenu: "Close Menu",
    skillLevel: "{name} level: {level}",
    downloadCertificate: "Download certificate: {name}",
    viewPublicationsBy: "View publications by {author} (from: {title})",
    toggleAbstract: "Toggle Abstract for {title}",
    toggleBibtex: "Toggle BibTeX for {title}",
    downloadPdf: "Download PDF for {title}",
    viewDoi: "View DOI for {title}",
    viewUrl: "View URL for {title}",
    viewSlides: "View Slides for {title}",
    viewPoster: "View Poster for {title}",
    copyAbstract: "Copy abstract for {title}",
    copyBibtex: "Copy BibTeX for {title}",
    homelabInfrastructure: "Homelab infrastructure",
    cvNavigation: "CV Navigation",
  },
  components: {
    faqHeading: "Frequently asked questions",
    copyButton: {
      clipboardUnavailable: "Clipboard API unavailable",
      failedToCopy: "Failed to copy!",
    },
    callout: {
      info: "Info",
      warning: "Warning",
      error: "Error",
      success: "Success",
      tip: "Tip",
      note: "Note",
      keypoint: "Key Point",
      important: "Important",
    },
    tldr: {
      title: "TL;DR",
      keyPoints: "{count} key points",
    },
    collapsible: {
      defaultSummary: "Details",
    },
    prerequisite: {
      title: "Prerequisites",
    },
    browserSupport: {
      title: "Browser Support",
      fullSupport: "Full Support",
      partialSupport: "Partial Support",
      noSupport: "No Support",
      unknown: "Unknown",
    },
    references: {
      title: "Further Reading & Resources",
    },
    deprecated: {
      label: "Deprecated",
      isDeprecated: "{feature} is deprecated",
      willBeRemoved: " and will be removed in {date}",
      useInstead: "Use instead:",
    },
    stateNotice: {
      deprecated: "Deprecated",
      mandatory: "Mandatory",
      experimental: "Experimental",
      preview: "Preview",
      breakingChange: "Breaking Change",
      security: "Security",
      isDeprecated: " is deprecated",
      isRequired: " is required",
      isExperimental: " is experimental",
      isInPreview: " is in preview",
      introducesBreaking: " introduces breaking changes",
      hasSecurityImplications: " has security implications",
      willBeRemoved: " and will be removed in {date}",
      effectiveFrom: " effective from {date}",
      mitigationRequired: " — mitigation required by {date}",
      target: " — target: {date}",
      useInstead: "Use instead:",
      recommended: "Recommended:",
    },
    versionBadge: {
      level: "Level",
    },
    apiEndpoint: {
      auth: "Auth",
    },
    fileContent: {
      copyContent: "Copy content of {filename}",
    },
    beforeAfter: {
      before: "Before",
      after: "After",
    },
    directiveCard: {
      syntax: "Syntax",
      default: "Default",
    },
    code: {
      codeAria: "{lang} code: {title}",
      snippetAria: "{lang} snippet: {text}",
      fallbackAria: "code snippet",
      copyAria: "Copy {label}",
    },
    terminal: {
      commandAria: "Terminal command: {command}",
      noCommand: "Terminal: no command",
      copyCommand: "Copy command: {command}",
      outputTitle: "Terminal Output: {title}",
      outputFallback: "Terminal Output",
      scrollableOutput: "Scrollable terminal output for {title}",
      scrollableFallback: "Scrollable terminal output",
      sessionAria: "Terminal session: {command}",
      sessionFallback: "interactive",
      terminalFallback: "terminal",
    },
    tabPanel: {
      copyContent: "Copy content from {label}",
    },
    table: {
      defaultAria: "Data table",
    },
    securityRating: {
      excellent: "Excellent",
      veryGood: "Very Good",
      good: "Good",
      acceptable: "Acceptable",
      needsImprovement: "Needs Improvement",
      poor: "Poor",
      critical: "Critical",
      ratingAria: "Security rating: {rating} - {label}",
    },
    barChart: {
      ariaWithTitle: "Bar chart: {title}. Showing {count} items.",
      ariaWithoutTitle: "Bar chart showing {count} items",
      ofTotal: "of total",
    },
    memoryMap: {
      ariaWithTitle: "Memory distribution: {title}. Showing {count} regions.",
      ariaWithoutTitle: "Memory distribution showing {count} regions",
    },
    registerMap: {
      ariaWithTitle: "Register layout: {title}. {count} fields.",
      ariaWithoutTitle: "Register layout with {count} fields",
      reserved: "reserved",
    },
    byteFrame: {
      ariaWithTitle: "Byte layout: {title}. {count} fields.",
      ariaWithoutTitle: "Byte layout with {count} fields",
      srCaption: "Byte layout",
      srField: "Field",
      srOffset: "Offset",
      srSize: "Size",
    },
    structPacking: {
      ariaWithTitle: "Struct layout: {title}. {count} members.",
      ariaWithoutTitle: "Struct layout with {count} members",
      padding: "padding",
    },
    deltaCompare: {
      ariaWithTitle: "Before/after comparison: {title}. {count} metrics.",
      ariaWithoutTitle: "Before/after comparison with {count} metrics",
      srCaption: "Before/after",
      srMetric: "Metric",
      srBefore: "Before",
      srAfter: "After",
      srChange: "Change",
    },
    layerStack: {
      ariaWithTitle: "Layer stack: {title}. {count} layers.",
      ariaWithoutTitle: "Layer stack with {count} layers",
    },
    matrix: {
      ariaWithTitle: "Matrix: {title}. {rows} rows by {cols} columns.",
      ariaWithoutTitle: "Matrix with {rows} rows and {cols} columns",
    },
    timingDiagram: {
      ariaWithTitle: "Timing diagram: {title}. {count} signals.",
      ariaWithoutTitle: "Timing diagram with {count} signals",
    },
    bitwiseOp: {
      ariaWithTitle: "Bitwise operation: {title}.",
      ariaWithoutTitle: "Bitwise operation diagram ({bits}-bit)",
    },
    numberBases: {
      ariaWithTitle: "Number bases: {title}.",
      ariaWithoutTitle: "A number shown in several bases",
      hex: "Hex",
      dec: "Dec",
      oct: "Oct",
    },
    floatLayout: {
      ariaWithTitle: "Floating-point layout: {title}.",
      ariaWithoutTitle: "IEEE 754 floating-point bit layout",
      sign: "sign",
      exponent: "exponent",
      mantissa: "mantissa",
    },
    packetDiagram: {
      ariaWithTitle: "Packet layout: {title}. {count} fields.",
      ariaWithoutTitle: "Packet layout with {count} fields",
    },
    subnetSplit: {
      ariaWithTitle: "Subnet split: {title}.",
      ariaWithoutTitle: "IP address network/host split",
    },
    callStack: {
      ariaWithTitle: "Call stack: {title}. {count} frames.",
      ariaWithoutTitle: "Call stack with {count} frames",
      growthLabel: "deeper — most recent call",
    },
    encodingDiagram: {
      ariaWithTitle: "Encoding: {title}.",
      ariaWithoutTitle: "Byte-encoding diagram",
    },
    pipeline: {
      ariaWithTitle: "Pipeline: {title}. {count} stages.",
      ariaWithoutTitle: "Pipeline with {count} stages",
    },
    forkJoin: {
      ariaWithTitle: "Fork-join data-flow diagram: {title}",
      ariaWithoutTitle: "Fork-join data-flow diagram",
    },
    timeline: {
      standard: "Standard",
      deprecated: "Deprecated",
      milestone: "Milestone",
    },
    keyspaceThreat: {
      scaleNote: "Bars are on a logarithmic scale.",
      tableCaption: "{secret}: keyspace vs attacker throughput",
      keyspaceRow: "{secret} keyspace",
      quantity: "Quantity",
      value: "Value",
      verdict: "Verdict",
      guessesPerSec: "guesses/s",
    },
    attackTimeline: {
      step: "Step",
      kind: "Kind",
      action: "Action",
      attacker: "attacker action",
      loop: "repeated step",
      leak: "information leaked",
      blocked: "blocked by design",
    },
    orderedCompare: {
      path: "Path",
      step: "Step",
      action: "Action",
      status: "Status",
      unsafeStep: "unsafe step",
      safeStep: "safe step",
      neutralStep: "step",
    },
    gauntlet: {
      titleFallback: "Decision gauntlet",
      aria: "{title}: {count} checks in order; any failure fails closed, all passing returns the result.",
      rejectTag: "any failure",
      check: "Check",
      onPass: "On pass",
      onFailure: "On failure",
    },
    mergeFlow: {
      titleFallback: "Merge flow",
      aria: "{title}: {count} stages, each combining inputs into one output that feeds the next.",
      operation: "Operation",
      inputs: "Inputs",
      output: "Output",
    },
    efuseFlow: {
      reachYes: "Secret is reachable by software",
      reachNo: "Secret never reaches software",
      tableCaption: "Where the device secret lives",
      backend: "Backend",
      deviceSecret: "Device secret",
      crossesToSoftware: "Crosses to software",
      softwareReachable: "Software-reachable?",
      yes: "Yes",
      no: "No",
    },
    capabilityMatrix: {
      // Defaults for the three cell states. They were hardcoded English
      // in the component, which every sibling avoids: a Spanish usage that
      // omitted the props would have rendered "Yes" to a Spanish reader.
      yes: "Yes",
      no: "No",
      na: "—",
    },
    attackSurfaceMatrix: {
      stoppedBy: "Stopped by",
      tableCaption: "Online versus offline attacker",
      attacker: "Attacker",
      rate: "Rate",
      can: "Can",
      cannot: "Cannot",
    },
    youtube: {
      defaultTitle: "YouTube Video",
    },
    mermaid: {
      defaultAria: "Mermaid Diagram",
    },
    tabs: {
      showTab: "Show {label} tab",
    },
  },
  seo: {
    rssFeedTitle: "JMRP Blog RSS Feed",
    siteTitle: "José Manuel Requena Plens | R&D Engineer",
    siteDescription:
      "Portfolio of José Manuel Requena Plens. Specializing in Embedded Systems, Acoustics, and Industrial Software Development.",
    siteKeywords:
      "R&D, Embedded Systems, Acoustics, Software Engineer, Portfolio, CV, Metamaterials, Research",
    jobTitle: "R&D Engineer",
  },
  pages: {
    home: {
      heroTitle: "Hi, I'm José Manuel.",
      heroSubtitle:
        "Embedded Firmware & Software Engineer. <br>Bridging the gap between <strong>firmware</strong>, software, and applied research.",
      heroBio1:
        "I'm José Manuel Requena Plens, an R&D engineer based in Valencia, Spain, specializing in embedded firmware (C/C++, STM32/ESP32), industrial software development, and applied acoustics research. My path runs from academic research in acoustics to industrial firmware development — and that breadth is what motivates me the most.",
      heroBio2:
        "I thrive on integrating hardware and software end to end. I'm an active Open Source contributor whose tools are used by developers around the world, and a passionate self-hoster. My homelab serves this site and the <a href='https://mcp.jmrp.io/' target='_blank' rel='external noopener noreferrer' class='external-link' aria-label='public MCP servers (opens in new tab)'>public MCP servers</a> anyone can point an AI client at. <a href='/cv/'>Check out my CV</a> to see the full journey.",
      viewCV: "View CV",
      viewCVAria: "View CV - my professional curriculum vitae",
      readBlog: "Read Blog",
      readBlogAria: "Read Blog - articles and tutorials",
      projects: "Projects",
      projectsAria: "Projects - view my work on GitHub",
      homelab: "Homelab",
      homelabAria: "Homelab - infrastructure and status",
      latestFromBlog: "Latest from the Blog",
      viewAllPosts: "View all posts →",
      featuredProjects: "Featured Projects",
      viewAllProjects: "View all projects →",
      availability: "Available for projects · Valencia (UTC+1)",
      terminalRole: "Firmware / Software Eng.",
      terminalLabel: "Profile summary",
    },
    blog: {
      title: "Blog",
      kicker: "Notes",
      subtitle: "Thoughts, tutorials, and engineering notes.",
      seriesLink: "Some of these were written as a set — read them in order",
      topicsTitle: "Topics",
      allPosts: "all",
      moreTopics: "+{count} more",
      featured: "featured",
      minRead: "min",
      searchPlaceholder: "search…",
      searchLabel: "Search posts",
      rssLabel: "RSS feed",
      noResults: "No posts match your filters.",
      aiDisclaimer:
        "Real projects, AI-assisted drafting. I document my actual experiments and code, using AI tools to structure and polish the final write-ups.",
      description:
        "Technical articles and tutorials on Nginx, MikroTik, networking, security, and DevOps. Practical guides from an R&D engineer's perspective.",
      schemaName: "Blog - José Manuel Requena Plens",
      relatedTitle: "Related on this site",
      relatedTools: "Try the tool",
      // Two claims sit in a post's header and they are not about the same
      // thing: "Updated {date}" is when the TEXT last changed, and this line is
      // when the author last re-ran the article's own instructions. "Last
      // verified 1 August" beside "Updated 3 September" read as a contradiction
      // — changed today, unchecked for a month — because both labels sounded
      // like a claim about the same act. Naming the act ("re-tested") and what
      // it was performed against removes the collision.
      //
      // The connector before the versions lives INSIDE the string on purpose:
      // it is "against" in English and "con" in Spanish, and the ` · ` that
      // used to stand in for it said nothing at all. The second variant is
      // used when the post pins versions, which is every post today, but the
      // schema defaults them to an empty array and a dangling "against" would
      // be worse than no versions.
      lastVerified: "Instructions re-tested {date}",
      lastVerifiedVersions: "Instructions re-tested {date} against {versions}",
    },
    blogPost: {
      backToBlog: "Back to Blog",
      updatedOn: "Updated {date}",
      coverImageAlt: "Cover image for {title}",
      readAction: "Read article →",
      codeFallback: "Code",
      copyMarkdown: "Copy as Markdown",
      copyingMarkdown: "Copying…",
      codeExampleTemplate: "{lang} example {index}",
      authorRole: "R&D Engineer",
      aboutAuthor: "About the author",
      authorBio:
        "José M. Requena Plens is an R&D engineer working where acoustics, electronics, and firmware meet — writing about embedded systems, security, and self-hosted infrastructure.",
      authorViewCv: "View CV",
      authorAvatarAlt: "Photo of {author}",
      aiDisclosure:
        "Drafted with AI assistance; reviewed, tested, and verified by the author.",
      editorialPolicyLink: "Editorial & corrections policy",
    },
    blogTags: {
      titlePrefix: "Blog - #",
      postSingular: "post",
      postPlural: "posts",
      articleSingular: "article",
      articlePlural: "articles",
      aboutTopic: "about this topic",
      backToAllPosts: "← Back to all posts",
      schemaName: "Blog posts tagged with #{tag}",
      schemaDescription: "Browse {count} articles about {tag}.",
      metaDescription:
        "Browse {count} technical {articleWord} about {tag}. In-depth tutorials and guides by José Manuel Requena Plens covering practical {tag} implementations.",
      // Short original prose per surviving tag (see BlogTagPage.astro), keyed
      // by the lowercase tag as returned by getUniqueTags(). Only tags that
      // currently label at least one post need an entry here.
      tagIntro: {
        security:
          "Hardening notes from real production deployments — mutual TLS, Content Security Policy, and deception techniques like tarpits and honeypots that slow down or trap malicious traffic before it reaches anything that matters.",
        nginx:
          "Nginx configuration deep dives, from access control and security headers to serving files without touching disk and enabling QUIC/HTTP/3 in production.",
        mikrotik:
          "RouterOS configurations tested on real home-lab hardware — VPN tunnels, dual-stack ISP setups, and defensive tricks running on a MikroTik router.",
        firmware:
          "Firmware engineering notes for resource-constrained microcontrollers: packing strings, deriving device-bound keys, and building an authenticated storage vault in C++.",
        esp32:
          "Practical firmware work on the ESP32 — memory-constrained C++ techniques verified on real hardware rather than a simulator.",
        ipv6: "Dual-stack configurations that treat IPv6 as a first-class citizen alongside IPv4, from prefix delegation on a residential ISP to routing it over a VPN tunnel.",
        networking:
          "Protocol-level notes on how traffic actually moves — from QUIC's transport-layer redesign to VPN tunnels and deliberately hostile behavior aimed at scanners.",
        cryptography:
          "Applied cryptography as it shows up in real systems: certificate-based authentication, CSP nonces, and key derivation and authenticated encryption on embedded hardware.",
        devops:
          "Deployment and infrastructure patterns for running services without unnecessary disk I/O or container image bloat — including Kubernetes health endpoints served straight from configuration.",
        embedded:
          "Notes from building software that has to fit in kilobytes of flash and RAM, where every string and byte layout is a deliberate choice.",
        linux:
          "Linux system administration as encountered running actual self-hosted services, not textbook examples.",
        privacy:
          "Running privacy infrastructure for real — a Tor bridge relay operated and documented from first setup through ongoing maintenance.",
        "c++":
          "C++ as used in firmware: manual memory layout, avoiding heap allocation where possible, and code verified against real embedded targets.",
      },
    },
    cv: {
      title: "CV",
      heading: "Curriculum Vitae",
      description:
        "CV of José Manuel Requena Plens — R&D Engineer in embedded systems, cloud infrastructure, acoustics, and industrial software.",
      certificateFallback: "Certificate",
      schemaDescription:
        "R&D Engineer specializing in software development, cloud infrastructure, and security.",
      levelNone: "None",
      levelElementary: "Elementary",
      levelBasic: "Basic",
      levelIntermediate: "Intermediate",
      levelAdvanced: "Advanced",
      levelExpert: "Expert",
      levelUnknown: "Unknown",
      downloadsTitle: "Download CV",
      downloadRecommended: "recommended",
      availability: "Availability",
      sidebarAriaLabel: "CV sidebar: contact, objective and languages",
      projectLinksAriaLabel: "{project} links",
      sidebarContact: "Contact",
      sidebarObjective: "Objective",
      sidebarLanguages: "Languages",
    },
    homelab: {
      kicker: "Infrastructure",
      // Standing description of the infrastructure, server-rendered.
      // Everything else on this page is a client-side island, so the static
      // HTML a crawler or a non-JS reader receives had no substance at all —
      // the one page carrying first-party measurements was also the emptiest.
      // These are facts that do not expire between deploys, so they can be
      // stated without a live fetch; the live numbers still arrive on hydration.
      summaryAriaLabel: "What runs in this homelab",
      summary1:
        "Everything described here runs on hardware I own and pay for, on a domestic fibre line in Valencia, Spain — not on a managed platform. The router is a MikroTik RB5009 terminating the ISP link over PPPoE with a delegated IPv6 prefix; the services sit behind it on mini PCs and a NAS, with two VPS for the parts that need to be reachable when the house is not.",
      summary2:
        "The self-hosted services include a Mastodon instance, a Matrix homeserver, an AT Protocol PDS, file sync, media streaming and monitoring. Four Tor nodes run alongside them: two bridges speaking obfs4 and WebTunnel, one in Valencia and one in Alicante, and two middle relays on IONOS VPS instances, one in London and one in Madrid.",
      summary3:
        "Security is one pipeline rather than a set of unrelated rules. A honeypot on the router turns a scanner's first packet into an address-list entry, nginx tarpits and pattern matches on the web tier, both feed CrowdSec, and CrowdSec drives bouncers back on the router and the reverse proxy. The counters above report what that pipeline is stopping. The figures are injected into this page by the edge server itself as it responds — no JavaScript involved — so every reader and every crawler sees the same numbers, stamped with the time they were captured.",
      realtimePill: "Live · injected at serve time",
      kpiAriaLabel: "Homelab headline metrics",
      kpiServicesOnline: "services online",
      kpiMonitoredNodes: "monitored nodes",
      kpiThreatsBlocked: "threats blocked · 24h",
      kpiRequests24h: "requests · 24h",
      kpiWan24h: "WAN traffic · 24h",
      edgeDefenseChip: "router + nginx",
      edgeDescription:
        "CrowdSec acts as a WAF: it analyses NGINX patterns and, together with the router honeypot, decides which IPs to block. Decisions fan out to every bouncer — NGINX, Cloudflare and the router via my cs-RouterOS-bouncer.",
      linkTarpit: "How the tarpit works ↗",
      linkHoneypot: "Honeypot & CrowdSec ↗",
      twinIntro:
        "Self-hosted infrastructure running on the author's own hardware and connections. Every figure below is substituted by nginx as this document is served, from the capture timestamped below; this file is never cached.",
      twinOverview: "At a glance",
      twinFleet: "Callable MCP endpoints",
      twinReplicas: "replicas alive",
      twinStatus: "Status",
      twinCapturedAt: "Captured at",
      twinRefresh: "refreshed at most once a minute",
      servicesKicker: "Public services",
      nodesUnit: "nodes",
      nodesLiveHint: "live load · injected at serve time",
      nodesAriaLabel: "Infrastructure node resource load",
      // An em-dash, not "no data". These are the initial values of the
      // client-side islands, so the static HTML a crawler receives contained
      // the literal string "no data" 31 times on the one page carrying the
      // site's only first-party measurements. A placeholder should be empty,
      // not an assertion that there is nothing to measure. Matches the
      // convention already used elsewhere in this file.
      noData: "—",
      nodeCpu: "CPU",
      nodeRam: "RAM",
      nodeTempOptimal: "Temp · Optimal",
      nodeTempHighLoad: "Temp · High load",
      nodeStatusOptimal: "Optimal",
      nodeStatusHighLoad: "High load",
      nodeNginxName: "NGINX Edge",
      nodeNginxRole: "Reverse proxy · firewall",
      nodeMatrixName: "Matrix Homeserver",
      nodeMatrixRole: "Synapse",
      nodeMastodonName: "Mastodon",
      nodeMastodonRole: "Fediverse instance",
      nodeTruenasName: "TrueNAS",
      nodeTruenasRole: "ZFS storage",
      nodeRouterName: "Edge Router",
      nodeRouterRole: "MikroTik · CrowdSec",
      edgeDefense: "Edge Defense",
      flowBand:
        "MikroTik honeypot + NGINX patterns → CrowdSec · WAF → bouncers (NGINX / router / Cloudflare)",
      mikrotikTitle: "MikroTik",
      mikrotikLayer: "network layer · honeypot",
      crowdsecTitle: "CrowdSec + NGINX",
      crowdsecLayer: "application layer · WAF",
      honeypotHits: "Honeypot hits",
      blacklistScanners: "Blacklisted scanners",
      activeConnections: "Active connections",
      wanTraffic: "WAN 24h",
      crowdsecBlocked: "CrowdSec · blocked IPs",
      torSectionAria: "Tor network nodes",
      torKicker: "Tor Network",
      torNodes: "monitored nodes",
      torClients: "clients helped · 24h",
      torBandwidth: "advertised bandwidth",
      torTraffic: "relayed traffic · 24h",
      title: "Homelab",
      schemaName: "Homelab Infrastructure",
      description:
        "Self-hosted infrastructure status — Mastodon, Matrix, AT Protocol, MCP and Tor services on a personal homelab. Real-time availability and statistics.",
      intro:
        "I maintain a homelab to support decentralized networks, personal infrastructure, and continuous learning. Below is the real-time status of my public services.",
      nginxNode: "Node: NGINX Edge Security & Analytics",
      userLabel: "User:",
      mastodonName: "Mastodon Instance",
      mastodonDescription:
        "A decentralized social network server. Part of the Fediverse.",
      mastodonLink: "Visit mstdn.jmrp.io",
      matrixName: "Matrix Homeserver",
      matrixDescription:
        "Secure, decentralized communication. My Server: matrix.jmrp.io",
      matrixLink: "Chat on Matrix",
      pdsName: "AT Protocol PDS",
      pdsDescription:
        "My self-hosted Personal Data Server on the AT Protocol network — the identity and data behind @jmrp.io on Bluesky.",
      pdsLink: "View on Bluesky",
      mcpName: "MCP Servers",
      mcpDescription:
        "Model Context Protocol servers I run and expose publicly, so an AI client can call them over HTTP without installing anything.",
      mcpLink: "Open mcp.jmrp.io",
      mcpInstances: "instances",
      mcpFleetAria: "Live status of each MCP server",
      // InfrastructureInsights
      statsAriaLabel: "Edge node real-time statistics",
      statsError: "Unable to load infrastructure statistics.",
      requestsReceived: "Requests Received (24h)",
      requestsReceivedSR: "requests received",
      handled: "handled",
      responsesSent: "Responses Sent",
      upstream: "Upstream (Forwarded)",
      sentPrefix: "Sent",
      bandwidthUp: "Bandwidth ↑",
      receivedPrefix: "Received",
      bandwidthDown: "Bandwidth ↓",
      securityBlocks: "Security & Blocks (24h)",
      loading: "Loading",
      totalSecurityBlocks: "total security blocks",
      blocks: "blocks",
      nginxBans: "Nginx Bans",
      tarpitBlogAria: "Read blog post about implementing Nginx Tarpit",
      tarpitHits: "Tarpit Hits",
      tarpitHitsUnit: "tarpit hits",
      portScannerBlogAria:
        "Read blog post about MikroTik Port Scanner Honeypot",
      attackRegions: "Attack Regions",
      attackRegionsList: "List of attack regions:",
      noAttackRegions: "No attack regions recorded",
      hits: "hits",
      rateLimits: "rate limits",
      systemStatus: "System Status",
      nodeResourceLoad: "Node Resource Load",
      cpuUsagePrefix: "CPU usage:",
      percentCPU: "% CPU",
      memoryUsage: "Memory Usage",
      percentRAM: "% RAM",
      loadStatus: "Load Status",
      statusCritical: "Critical",
      statusHigh: "High",
      statusElevated: "Elevated",
      statusOptimal: "Optimal",
      statusHealthy: "Healthy",
      statusUnknown: "Unknown",
      // ServiceStats
      serviceUnavailable: "Service Unavailable",
      // Mirrored by SERVICE_WORDS in /etc/nginx/lua/homelab_ssr_metrics.lua:
      // nginx injects these words per service at serve time (HLM_SVC_*).
      online: "Online",
      offline: "Offline",
      knownInstances: "Known Instances",
      knownServers: "Known Servers",
      trendingNow: "Trending Now",
      pdsRecords: "Records",
      // ServerInsights — Matrix
      matrixNode: "Node: Matrix Homeserver",
      matrixStatsAriaLabel: "Matrix server real-time statistics",
      matrixStatsError: "Unable to load Matrix statistics.",
      matrixWorkers: "Active Workers",
      matrixWorkersUnit: "workers",
      matrixMainProcess: "Main Process",
      matrixRunning: "Running",
      matrixStopped: "Stopped",
      matrixRooms: "Total Rooms",
      matrixLocalRooms: "Local Rooms",
      matrixUsers: "Local Users",
      matrixRemoteUsers: "Remote Users",
      matrixFederation: "Federation",
      matrixFederationServers: "Known Servers",
      matrixTotalEvents: "Total Events",
      matrixDbSize: "Database Size",
      matrixSynapse: "Synapse",
      // ServerInsights — Mastodon
      mastodonNode: "Node: Mastodon Instance",
      mastodonStatsAriaLabel: "Mastodon server real-time statistics",
      mastodonStatsError: "Unable to load Mastodon statistics.",
      sidekiqJobs: "Jobs Processed",
      sidekiqJobsUnit: "processed",
      sidekiqFailed: "Failed",
      sidekiqRetry: "Retry Queue",
      sidekiqScheduled: "Scheduled",
      sidekiqProcesses: "Processes",
      pumaThreads: "Puma Threads",
      mastodonFederation: "Federation",
      mastodonKnownDomains: "known domains",
      mastodonKnownPeers: "Known Peers",
      mastodonDbSize: "Database Size",
      mastodonMediaStorage: "Media Storage",
      // ServerInsights — TrueNAS
      truenasNode: "Node: TrueNAS Storage Server",
      truenasStatsAriaLabel: "TrueNAS server real-time statistics",
      truenasStatsError: "Unable to load TrueNAS statistics.",
      storageTitle: "ZFS Storage",
      storageUnit: "total",
      poolHealth: "Health",
      arcCache: "ZFS ARC Cache",
      cpuTemp: "CPU Temperature",
      // Edge Router (MikroTik)
      routerNode: "Edge Router — MikroTik",
      mikrotikStatsAriaLabel: "Edge Router statistics and metrics",
      mikrotikStatsError: "Unable to load Edge Router metrics.",
      mikrotikSystem: "System",

      mikrotikCpuFrequency: "CPU Frequency",
      mikrotikMhz: "MHz",
      mikrotikStorage: "Storage",
      mikrotikNetwork: "WAN Traffic (24h)",
      mikrotikWanDownload: "↓ Download",
      mikrotikWanUpload: "↑ Upload",
      mikrotikWanPackets: "Packets",
      mikrotikPacketsUnit: "packets",
      mikrotikSecurity: "Firewall",
      mikrotikActiveConnections: "Active Connections (current)",
      mikrotikCrowdsecBlocked: "CrowdSec Blocked",
      mikrotikBlacklistScanners: "Blacklisted Scanners",
      mikrotikHoneypotHits: "Honeypot Hits",
      mikrotikPortScanners: "Port Scanners Dropped",
      // Tor Network
      torBridgeName: "Tor Bridge (ES0)",
      torBridgeDescription:
        "Pluggable transport bridge helping censored users access the Tor network from Valencia. Running obfs4 and WebTunnel.",
      torRelayName: "Tor Relay (UK)",
      torRelayDescription:
        "Middle relay forwarding encrypted traffic within the Tor network from United Kingdom.",
      torRelayEsName: "Tor Relay (ES)",
      torRelayEsDescription:
        "Middle relay forwarding encrypted traffic within the Tor network from Madrid.",
      torBridgeEs1Name: "Tor Bridge (ES1)",
      torBridgeEs1Description:
        "Pluggable transport bridge helping censored users access the Tor network from Alicante. Running obfs4 and WebTunnel.",
      torBridgeEs1Link: "View on Tor Metrics",
      torBridgeLink: "View on Tor Metrics",
      torRelayLink: "View on Tor Metrics",
      torRelayEsLink: "View on Tor Metrics",
      torRunning: "Running",
      torOffline: "Offline",
      torVersion: "Version",
      torRecommended: "recommended",
      torObsolete: "obsolete",
      torFlags: "Flags",
      torTransports: "Transports",
      torTraffic24h: "Traffic (24h)",
      torDownload: "↓ Download",
      torUpload: "↑ Upload",
      torClients24h: "Clients (24h)",
      torOrConnections: "OR Connections",
      torCircuits: "Open Circuits",
      torConnections24h: "Peers (24h)",
      torAdvertisedBandwidth: "Adv. Bandwidth",
      torLocation: "Location",
      torStatsError: "Unable to load Tor statistics.",
      // ServerInsights — Common
      resourceLoad: "Resource Load",
      dbConnections: "connections",
      redisMemory: "Redis Memory",
      servicesLabel: "Services",
      databaseLabel: "Database",
    },
    publications: {
      title: "Publications",
      kicker: "Research",
      description:
        "Academic publications and research papers by José Manuel Requena Plens. Topics include acoustics, metamaterials, ultrasound, and noise mitigation for ESA.",
      schemaDescription:
        "Academic publications and research by José Manuel Requena Plens.",
      periodNote:
        "Research output from my academic period (2017–2021), before moving to industry.",
      orcidLink: "ORCID",
      journalArticles: "Journal articles",
      conferencePapers: "Conference and workshop papers",
      thesis: "Thesis",
      other: "Other",
      abstract: "Abstract",
      bibtex: "BibTeX",
      etAl: "et al.",
      slides: "Slides",
      poster: "Poster",
      showAllAuthors: "Show all authors",
      statPublications: "publications",
      statJournals: "journal articles",
      statConferences: "conference papers",
      statTheses: "theses",
      statOther: "other works",
      statCitations: "citations",
      statHIndex: "h-index",
      statCoauthors: "co-authors",
      filterType: "Type",
      filterAll: "all",
      export: "Export",
      exportBibtex: "BibTeX (.bib)",
      citations: "cites",
      chipJournal: "journal",
      chipConference: "conference",
      chipThesis: "thesis",
      chipOther: "other",
      noData: "—",
    },
    about: {
      title: "About",
      description:
        "José Manuel Requena Plens — firmware and software engineer in Valencia building secure embedded devices, open-source tools, and self-hosted infrastructure.",
      editorialTitle: "// EDITORIAL & CORRECTIONS",
      editorialBody1:
        "Everything published here comes from work actually done: commands run on real hardware and real servers, configuration quoted from systems that are running it, and, where a guide depends on a specific software version, that version stated in the article. Claims that are not mine to make — protocol behavior, cryptographic properties, vendor defaults — are checked against primary sources (RFCs, standards bodies, vendor documentation) and cited, and links are re-checked automatically in CI, except for a documented list of domains that reject automated checkers.",
      editorialBody2:
        "Each post carries an AI-assistance disclosure, so here is exactly what it means. AI tools help with drafting, structure, copy-editing and the Spanish translation. They do not decide what is true: every command, configuration snippet and measurement is executed and verified by me before it ships, and nothing is published straight from a model's output. The Spanish version is a translation of the same verified material, not a separately generated article.",
      editorialBody3:
        "If something here is wrong, tell me. A short email with the article and the problem is enough — no account, no form. Vulnerability reports have their own channel and PGP key in security.txt.",
      editorialBody4:
        "Corrections are made in the article itself rather than in a comment thread. The revision date shown on the page and in its structured data is not maintained by hand: it is computed at build time as the most recent of four things — when the article was published, any date I set on it deliberately, the last time I re-tested it against the software versions it names, and the last commit that changed its substance — so it cannot fall behind the text, including when the change is a small one. Mechanical changes — a formatting pass, a link attribute, a typo — leave the dates alone. The ones that predate this rule are listed by commit hash, each with the reason it qualifies, in the module that computes the date (src/utils/post-dates.ts); any later one declares itself in its own commit message. There is no per-article changelog; the record of what changed, and when, is the full edit history of this site, which is public in its repository.",
      editorialReportLabel: "Report an error",
      editorialSecurityLabel: "security.txt",
    },
    uses: {
      title: "Uses",
      description:
        "The hardware, software, and services José Manuel Requena Plens keeps in rotation — desk, dev tools, and homelab.",
    },
    feeds: {
      blueskyTitle: "Curated feeds on Bluesky",
      blueskyIntro:
        "Beyond this site's own posts, I run eight curated Bluesky feeds — one per language — about open source, programming and homelab. Automated curation with human review; follow them from any Bluesky account.",
      blueskyOpen: "Open on Bluesky",
      title: "Feeds",
      description:
        "Subscribe to this site with RSS: feed URLs for the English and Spanish blogs, what RSS is in two sentences, and the latest posts.",
      kicker: "FEEDS",
      heading: "Subscribe with RSS",
      intro:
        "RSS lets a reader app check this site for new posts so you don't have to. Copy a feed URL below into any reader (Feedbin, Miniflux, NetNewsWire, Thunderbird…) and new articles will arrive on their own — no account, no algorithm, no email.",
      landedTitle: "Expected raw XML?",
      landedBody:
        "This page appears when you open the feed in a browser. Your RSS reader still receives the plain XML feed at the very same URL — nothing changed for it.",
      feedEnglish: "English blog feed",
      feedSpanish: "Spanish blog feed",
      copyUrl: "Copy feed URL",
      latestTitle: "Latest posts",
      backToBlog: "Browse the blog",
    },
    privacy: {
      // The copy lives in src/content/pages/<locale>/privacy.mdx. All that
      // remains here is the contact section's anchor, which the footer links
      // and which the MDX heading now generates — so it is locale-dependent.
      contactAnchor: "contact",
    },
    projects: {
      title: "Projects",
      description:
        "Open-source projects by José Manuel Requena Plens — MCP servers, acoustics tooling and network security, each with source, docs and license.",
      schemaDescription:
        "Curated index of the open-source software authored and maintained by José Manuel Requena Plens, with language, license, source repository and documentation for each project.",
      kicker: "PROJECTS",
      heading: "What I build, and where it lives.",
      intro:
        "The open-source projects I author and maintain — MCP servers and developer tooling in Go, acoustics and signal-processing libraries, network security and infrastructure scripts. Every entry links to its source and its documentation, and the hosted MCP servers also link to a running instance you can call.",
      activeHeading: "// MAINTAINED",
      activeIntro:
        "Actively developed. These get releases, issue triage and documentation.",
      archivedHeading: "// ARCHIVED",
      archivedIntro:
        "No longer maintained, kept public and read-only. Mostly research and instrumentation work from the acoustics years.",
      language: "Language",
      license: "License",
      repo: "Source",
      docs: "Docs",
      hosted: "Live instance",
      downloads: "Downloads",
      downloadsNote:
        "Download figures combine GitHub release artifacts, Docker Hub image pulls and MATLAB File Exchange downloads. Checksum, signature and SBOM files are not counted: a release publishes them next to the binary and every install fetches both, so counting them would report the same install twice. The File Exchange figures are read by hand ({date}) because MathWorks refuses scripted requests, and a project shows its own figure only once it passes 1,000 — so the per-project numbers below do not add up to the site-wide total.",
      downloadsSourceLead:
        "The exact rule, and the full list of channels counted and skipped:",
      topicsLabel: "Topics covered by {project}",
      supportHeading: "Support",
      supportIntro:
        "These projects are maintained in my own time, on hardware that runs at home. If one of them saves you an afternoon, you can sponsor the work on GitHub. Nothing here sits behind a paywall either way, and nothing here tracks you.",
      supportLink: "Sponsor on GitHub",
    },
    tools: {
      title: "Developer Tools",
      description:
        "Free interactive developer tools for security, encoding, networking, and embedded systems. They run in your browser — privacy first.",
      intro:
        "Browser-based utilities for web security and development. All calculations happen locally—no data is sent to any server.",
      aboutTitle: "About These Tools",
      privacyTitle: "Privacy First",
      privacyDesc:
        "All calculations happen in your browser. Your code never leaves your device.",
      instantTitle: "Instant Results",
      instantDesc:
        "No server round-trips. Results update as you type with zero latency.",
      openSourceTitle: "Open Source",
      openSourceDesc: "View the source code on {link}. Contributions welcome.",
      categorySecurity: "Security Tools",
      categoryDeveloper: "Developer Tools",
      categoryNetwork: "Network & Server Tools",
      categoryEmbedded: "Embedded & Industrial Tools",
      categoryMikrotik: "MikroTik Tools",
      shortSecurity: "security",
      shortDeveloper: "dev",
      shortNetwork: "network",
      shortEmbedded: "embedded",
      shortMikrotik: "mikrotik",
      statusPrivacy: "privacy-first",
      statusTelemetry: "0 telemetry",
      filterAll: "all",
      filterLabel: "Filter tools by category",
      categoryLabel: "Category",
    },
    toolsCategory: {
      toolSingular: "tool",
      toolPlural: "tools",
      inCategory: "in this category",
      backToTools: "← Back to all tools",
      securityDesc:
        "Free security tools that run in your browser — CSP policy builder and hash calculator, certificate inspector, HTTP header analyzer, and more.",
      developerDesc:
        "Free online developer utilities — Base64 encoder, regex tester, cron expression builder, Unix timestamp converter, and color contrast checker.",
      networkDesc:
        "Free network tools — an Nginx config generator and an IPv4/IPv6 subnet calculator with VLSM planning and reverse DNS. Both run in your browser.",
      embeddedDesc:
        "Free embedded tools — a Modbus RTU/TCP frame builder with CRC, and a string-pool packer for firmware translation tables. Both run in your browser.",
      mikrotikDesc:
        "Free MikroTik RouterOS tools — WireGuard VPN config generator for dual-stack setups. All processing runs locally in your browser.",
      // MAINTENANCE: each <cat>Context below narrates what the category's
      // CURRENT tools do (approved copy, 2026-08-22). Adding, removing or
      // renaming a tool in a category may require updating its context AND its
      // <cat>Desc above, in BOTH locales — a context that names a tool the
      // category no longer has is a checkable lie. See also
      // docs/BLOG_POST_GUIDE.md's sibling note for tools.
      securityContext:
        "Use these when you're hardening a site or checking someone else's work: build a Content-Security-Policy and hash its inline scripts, inspect a TLS certificate before trusting it, audit response headers, or reason about password and PIN strength with real numbers. Everything is computed in your browser; the only exception is the header analyzer's optional fetch, which goes through a proxy on this site and is not logged.",
      developerContext:
        "The small conversions that interrupt real work: decoding a Base64 blob, testing a regex against sample text, writing a cron expression you can trust, turning a Unix timestamp into a date, or checking a color pair against WCAG. Each one does its job without an account, an upload, or a network request.",
      networkContext:
        "For planning before touching production: generate an Nginx server block with modern TLS and rate limiting to compare against your own, or slice an IPv4/IPv6 range into subnets with VLSM before committing it to router config. Both run locally in your browser.",
      embeddedContext:
        "Companions for firmware work: build or decode a Modbus RTU/TCP frame byte by byte — CRC included — when a device won't answer, and measure what a packed, tail-merged string pool would save in your translation tables before writing the code. Both run in your browser.",
      mikrotikContext:
        "RouterOS has its own syntax and its own pitfalls. This generator produces a complete dual-stack WireGuard setup — interface, peers, firewall and NAT — as paste-ready RouterOS commands, so the structure is right before you adapt it to your network. Runs in your browser.",
      fallbackDesc: "Tools in the {category} category.",
    },
    notFound: {
      title: "404: Ah ah ah!",
      description: "You didn't say the magic word — page not found",
      pageNotFound: "Page Not Found",
      message: "Ah ah ah, you didn't say the magic word!",
      goHome: "← Go Home",
      nedryAlt: "Dennis Nedry illustration from Jurassic Park",
    },
  },
  rss: {
    continueReading: "Continue reading on jmrp.io →",
    copyright:
      "© {year} José Manuel Requena Plens. Articles are licensed CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/",
  },
  pwa: {
    shortcutBlog: "Blog",
    shortcutBlogDesc: "Read the latest thoughts and tutorials",
    shortcutCV: "CV",
    shortcutCVDesc: "View professional experience and skills",
    shortcutPublications: "Publications",
    shortcutPublicationsDesc: "Research papers and co-authors",
  },
  content: {
    fallbackNotice:
      "This content is not yet available in your language. Showing the original English version.",
  },
} as const;

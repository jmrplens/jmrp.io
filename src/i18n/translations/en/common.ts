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
    repositories: "Repositories",
    homelab: "Homelab",
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
    language: "Language",
    english: "English",
    spanish: "Español",
    switchLanguage: "Switch to {lang}",
    copyright: "© {year} {author}. All rights reserved.",
  },
  aria: {
    mainNav: "Main Navigation",
    homeLogo: "Home - JMRP",
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
    searchRepos: "Search repositories",
    viewRepo: "View repository {name} on GitHub",
    authRequired: "Authentication required",
    playSoundNedry: "Play Nedry sound",
    languageSwitcher: "Switch language",
  },
  seo: {
    rssFeedTitle: "JMRP Blog RSS Feed",
  },
  pages: {
    home: {
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
      viewAllRepos: "View all repositories →",
    },
    blog: {
      title: "Blog",
      subtitle: "Thoughts, tutorials, and engineering notes.",
      aiDisclaimer:
        "Real projects, AI-assisted drafting. I document my actual experiments and code, using AI tools to structure and polish the final write-ups.",
      description:
        "Technical articles and tutorials on Nginx, MikroTik, networking, security, and DevOps. Practical guides from an R&D engineer's perspective.",
      schemaName: "Blog - José Manuel Requena Plens",
    },
    blogPost: {
      backToBlog: "Back to Blog",
      coverImageAlt: "Cover image for {title}",
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
    },
    cv: {
      title: "CV",
      heading: "Curriculum Vitae",
      description:
        "CV of José Manuel Requena Plens — R&D Engineer in embedded systems, cloud infrastructure, acoustics, and industrial software.",
    },
    github: {
      title: "GitHub Repositories",
      description:
        "Open source projects and contributions by José Manuel Requena Plens. Tools for acoustics, DevOps utilities, and community resources.",
      schemaDescription:
        "Open source contributions and repositories by José Manuel Requena Plens.",
      bioFallback: "Open Source Enthusiast",
      repositories: "Repositories",
      followers: "Followers",
      following: "Following",
    },
    homelab: {
      title: "Homelab Status",
      description:
        "Self-hosted infrastructure status — Mastodon, Matrix, and Meshtastic services running on a personal homelab. Real-time availability and statistics.",
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
      meshtasticName: "Meshtastic Infrastructure",
      meshtasticDescription:
        "Infrastructure for the Meshtastic mesh network. Includes Map, Node Database, and Network Monitors.",
      meshtasticLink: "Open Mesh Hub",
    },
    publications: {
      title: "Publications",
      description:
        "Academic publications and research papers by José Manuel Requena Plens. Topics include acoustics, metamaterials, ultrasound, and noise mitigation for ESA.",
      schemaDescription:
        "Academic publications and research by José Manuel Requena Plens.",
    },
    tools: {
      title: "Developer Tools",
      description:
        "Free interactive developer tools for security, encoding, networking, and embedded systems. All tools run entirely in your browser — privacy first.",
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
    },
    toolsCategory: {
      toolSingular: "tool",
      toolPlural: "tools",
      inCategory: "in this category",
      backToTools: "← Back to all tools",
    },
    notFound: {
      title: "404: Ah ah ah!",
      description: "You didn't say the magic word — page not found",
      pageNotFound: "Page Not Found",
      message: "Ah ah ah, you didn't say the magic word!",
      goHome: "← Go Home",
    },
  },
} as const;

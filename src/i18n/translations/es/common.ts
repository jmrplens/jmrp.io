/**
 * Spanish translations — common UI strings.
 *
 * Covers navigation, layout, ARIA labels, and shared UI elements.
 * Keys follow dot-notation convention: `t("nav.home")`.
 */
export const common = {
  nav: {
    home: "Inicio",
    blog: "Blog",
    tools: "Herramientas",
    cv: "CV",
    publications: "Publicaciones",
    repositories: "Repositorios",
    homelab: "Homelab",
  },
  ui: {
    skipToContent: "Ir al contenido",
    readMore: "Leer más",
    backTo: "← Volver a {page}",
    viewAll: "Ver todos los {items} →",
    loading: "Cargando...",
    error: "Ha ocurrido un error",
    noResults: "No se encontraron resultados.",
    search: "Buscar",
    close: "Cerrar",
    open: "Abrir",
    language: "Idioma",
    english: "English",
    spanish: "Español",
    switchLanguage: "Cambiar a {lang}",
    copyright: "© {year} {author}. Todos los derechos reservados.",
  },
  aria: {
    mainNav: "Navegación principal",
    homeLogo: "Inicio - JMRP",
    toggleNav: "Alternar navegación",
    toggleTheme: "Alternar tema",
    switchToDark: "Cambiar a tema oscuro",
    switchToLight: "Cambiar a tema claro",
    breadcrumb: "Migas de pan",
    tableOfContents: "Tabla de contenidos",
    tocDrawer: "Panel de tabla de contenidos",
    close: "Cerrar",
    copyToClipboard: "Copiar al portapapeles",
    copied: "¡Copiado!",
    visitProfile: "Visitar mi perfil de {name}",
    viewTaggedPosts: "Ver todas las publicaciones con la etiqueta {tag}",
    readArticle: "Leer artículo: {title}",
    opensNewTab: "{text} (abre en nueva pestaña)",
    showTab: "Mostrar pestaña {label}",
    calloutType: "Aviso de tipo {type}",
    stepByStep: "Guía paso a paso",
    checklist: "Lista de verificación",
    codeContent: "Contenido del código para {filename}",
    comparison: "Comparación: {before} vs {after}",
    mdnDocs: "Documentación de MDN para {name}",
    searchRepos: "Buscar repositorios",
    viewRepo: "Ver repositorio {name} en GitHub",
    authRequired: "Autenticación requerida",
    playSoundNedry: "Reproducir sonido de Nedry",
    languageSwitcher: "Cambiar idioma",
  },
  seo: {
    rssFeedTitle: "RSS del Blog JMRP",
  },
  pages: {
    home: {
      viewCV: "Ver CV",
      viewCVAria: "Ver CV - mi currículum profesional",
      readBlog: "Leer Blog",
      readBlogAria: "Leer Blog - artículos y tutoriales",
      projects: "Proyectos",
      projectsAria: "Proyectos - ver mi trabajo en GitHub",
      homelab: "Homelab",
      homelabAria: "Homelab - infraestructura y estado",
      latestFromBlog: "Últimas entradas del Blog",
      viewAllPosts: "Ver todas las entradas →",
      featuredProjects: "Proyectos destacados",
      viewAllRepos: "Ver todos los repositorios →",
    },
    blog: {
      title: "Blog",
      subtitle: "Reflexiones, tutoriales y notas de ingeniería.",
      aiDisclaimer:
        "Proyectos reales, redacción asistida por IA. Documento mis experimentos y código reales, usando herramientas de IA para estructurar y pulir los textos finales.",
      description:
        "Artículos técnicos y tutoriales sobre Nginx, MikroTik, redes, seguridad y DevOps. Guías prácticas desde la perspectiva de un ingeniero de I+D.",
      schemaName: "Blog - José Manuel Requena Plens",
    },
    blogPost: {
      backToBlog: "Volver al Blog",
      coverImageAlt: "Imagen de portada de {title}",
    },
    blogTags: {
      titlePrefix: "Blog - #",
      postSingular: "entrada",
      postPlural: "entradas",
      articleSingular: "artículo",
      articlePlural: "artículos",
      aboutTopic: "sobre este tema",
      backToAllPosts: "← Volver a todas las entradas",
      schemaName: "Entradas del blog con la etiqueta #{tag}",
      schemaDescription: "Explora {count} artículos sobre {tag}.",
      metaDescription:
        "Explora {count} {articleWord} técnicos sobre {tag}. Tutoriales detallados y guías de José Manuel Requena Plens con implementaciones prácticas de {tag}.",
    },
    cv: {
      title: "CV",
      heading: "Curriculum Vitae",
      description:
        "CV de José Manuel Requena Plens — Ingeniero de I+D en sistemas embebidos, infraestructura cloud, acústica y software industrial.",
    },
    github: {
      title: "Repositorios de GitHub",
      description:
        "Proyectos y contribuciones open source de José Manuel Requena Plens. Herramientas de acústica, utilidades DevOps y recursos comunitarios.",
      schemaDescription:
        "Contribuciones y repositorios open source de José Manuel Requena Plens.",
      bioFallback: "Entusiasta del Open Source",
      repositories: "Repositorios",
      followers: "Seguidores",
      following: "Siguiendo",
    },
    homelab: {
      title: "Estado del Homelab",
      description:
        "Estado de la infraestructura autoalojada — Mastodon, Matrix y Meshtastic ejecutándose en un homelab personal. Disponibilidad y estadísticas en tiempo real.",
      intro:
        "Mantengo un homelab para dar soporte a redes descentralizadas, infraestructura personal y aprendizaje continuo. A continuación se muestra el estado en tiempo real de mis servicios públicos.",
      nginxNode: "Nodo: NGINX Edge Security & Analytics",
      userLabel: "Usuario:",
      mastodonName: "Instancia de Mastodon",
      mastodonDescription:
        "Un servidor de red social descentralizada. Parte del Fediverso.",
      mastodonLink: "Visitar mstdn.jmrp.io",
      matrixName: "Servidor Matrix",
      matrixDescription:
        "Comunicación segura y descentralizada. Mi servidor: matrix.jmrp.io",
      matrixLink: "Chatear en Matrix",
      meshtasticName: "Infraestructura Meshtastic",
      meshtasticDescription:
        "Infraestructura para la red mesh Meshtastic. Incluye mapa, base de datos de nodos y monitores de red.",
      meshtasticLink: "Abrir Mesh Hub",
    },
    publications: {
      title: "Publicaciones",
      description:
        "Publicaciones académicas y artículos de investigación de José Manuel Requena Plens. Temas: acústica, metamateriales, ultrasonidos y mitigación de ruido para la ESA.",
      schemaDescription:
        "Publicaciones académicas e investigación de José Manuel Requena Plens.",
    },
    tools: {
      title: "Herramientas para desarrolladores",
      description:
        "Herramientas interactivas gratuitas para desarrolladores: seguridad, codificación, redes y sistemas embebidos. Todo se ejecuta en tu navegador — privacidad ante todo.",
      intro:
        "Utilidades en el navegador para seguridad web y desarrollo. Todos los cálculos se realizan localmente — ningún dato se envía a ningún servidor.",
      aboutTitle: "Sobre estas herramientas",
      privacyTitle: "Privacidad ante todo",
      privacyDesc:
        "Todos los cálculos se realizan en tu navegador. Tu código nunca sale de tu dispositivo.",
      instantTitle: "Resultados instantáneos",
      instantDesc:
        "Sin peticiones al servidor. Los resultados se actualizan mientras escribes, sin latencia.",
      openSourceTitle: "Open Source",
      openSourceDesc:
        "Consulta el código fuente en {link}. Las contribuciones son bienvenidas.",
      categorySecurity: "Herramientas de seguridad",
      categoryDeveloper: "Herramientas para desarrolladores",
      categoryNetwork: "Herramientas de red y servidor",
      categoryEmbedded: "Herramientas embebidas e industriales",
      categoryMikrotik: "Herramientas MikroTik",
    },
    toolsCategory: {
      toolSingular: "herramienta",
      toolPlural: "herramientas",
      inCategory: "en esta categoría",
      backToTools: "← Volver a todas las herramientas",
    },
    notFound: {
      title: "404: Ah ah ah!",
      description: "No has dicho la palabra mágica — página no encontrada",
      pageNotFound: "Página no encontrada",
      message: "¡Ah ah ah, no has dicho la palabra mágica!",
      goHome: "← Ir al inicio",
    },
  },
} as const;

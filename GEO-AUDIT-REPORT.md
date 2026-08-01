# Auditoría GEO: jmrp.io

**Fecha:** 1 de agosto de 2026
**URL:** https://jmrp.io
**Tipo de sitio:** Publisher / marca personal (autor técnico individual)
**Páginas analizadas:** 38 rastreadas de 142 en el sitemap (71 EN + 71 ES)
**Método:** 5 agentes especialistas en paralelo + verificación independiente del orquestador

---

## Resumen ejecutivo

**Puntuación GEO global: 75/100 (Bueno)**

jmrp.io es una de las implementaciones GEO mejor ejecutadas que se pueden encontrar en un sitio personal: el acceso de rastreadores de IA es perfecto, cada post lleva TL;DR + FAQ + JSON-LD (`TechArticle`/`FAQPage`/`HowTo`) + `speakable`, los 96 identificadores Wikidata del sitio resuelven correctamente, y la paridad EN/ES es estructuralmente completa. **El contenido ya se está citando**: en pruebas en vivo, el sitio aparece en posición #1 en tres de cuatro consultas de nicho, y los resúmenes generados por IA reproducen cifras que solo existen en estos posts.

El déficit no es técnico. Es de **autoridad de entidad**: no existe ningún ítem de Wikidata para el autor, y no hay huella alguna de discusión en Reddit, Hacker News o Stack Overflow. Los sistemas de IA leen este sitio a la perfección, pero no tienen ninguna señal externa que les diga que su autor merece ser citado por su nombre.

### Desglose de puntuaciones

| Categoría                      | Puntuación | Peso | Ponderado          |
| ------------------------------ | ---------- | ---- | ------------------ |
| Citabilidad por IA             | 86/100     | 25%  | 21,50              |
| Autoridad de marca             | 31/100     | 20%  | 6,20               |
| Calidad de contenido (E-E-A-T) | 82/100     | 20%  | 16,40              |
| GEO técnico                    | 97/100     | 15%  | 14,55              |
| Schema y datos estructurados   | 89/100     | 10%  | 8,90               |
| Optimización por plataforma    | 77/100     | 10%  | 7,70               |
| **GEO global**                 |            |      | **75,25 → 75/100** |

**Lectura del contraste 86 vs 31.** La citabilidad del contenido está en el decil superior; la autoridad de marca está en el suelo. Un único punto — crear la entidad Wikidata y sembrar discusión real de terceros — movería la autoridad de marca hacia ~55-60 y el compuesto a **~81 (Excelente)** sin tocar una sola línea del sitio.

> **Matiz honesto sobre el 31/100.** 65 de los 100 puntos de esa rúbrica viven en Wikipedia + Reddit + YouTube, tres plataformas estructuralmente difíciles para un ingeniero individual. Medido solo por señales académicas y de desarrollador (ORCID con 14 trabajos, 13 DOI de Zenodo, Google Scholar, ResearchGate, GitHub, listado independiente en mcpservers.org), el perfil es respetable. Pero la rúbrica no se equivoca en el resultado: sin nodo canónico de entidad, los modelos no tienen a qué anclar el nombre.

---

## Correcciones a hallazgos de los agentes (leer antes de actuar)

Verifiqué de forma independiente las afirmaciones de mayor impacto. **Tres no se sostuvieron.** Actuar sobre ellas habría causado trabajo desperdiciado o daño real:

**1. «Falta el TL;DR en los posts 003, 007 y 008» — FALSO.**
Dos agentes distintos lo afirmaron, uno añadiendo que el selector `speakable` `.tldr-content` queda sin vincular. Comprobado en el HTML servido: los posts 003, 007 y 008 renderizan `.tldr-content` de forma **idéntica** al post 005 (12 ocurrencias, misma clase `.tldr-summary`). El componente `<TLDRSummary>` está presente y correctamente posicionado en **12/12 posts EN y 12/12 ES**. `speakable` vincula sin problema.
_El defecto real es de redacción, no de estructura_: esos tres usan un encuadre de agenda (`What You'll Learn` / `What You'll Build` / `What You'll Configure`) con viñetas que prometen lo que el artículo hará, en vez de afirmaciones autocontenidas. Compárese con el post 005 (`TL;DR — Trap scanners in a slow Nginx tarpit`), cuyas viñetas sobreviven al ser extraídas sin contexto. Dato relevante: 005 y 006, ambos con encuadre de respuesta, son dos de los tres #1 demostrados.
**Acción correcta:** reescribir título y viñetas de 003/007/008. **No** añadir un componente que ya existe.

**2. «Servir un 410 en la URL retirada /github/» — INCORRECTO.**
`/github/` devuelve **301 → /projects/**, y `/es/github/` → `/es/projects/`. La redirección ya es el manejo correcto y preserva la señal de enlaces. Cambiarla a 410 destruiría equity sin ganancia. Que la URL antigua siga apareciendo en índices de terceros se resuelve solo.

**3. «Añadir schema HowTo a los posts 010, 011 y 012» — RECHAZADO.**
Un agente lo recomendó; el agente de schema lo evaluó correctamente al revés. Esos tres son ensayos de justificación de diseño, no procedimientos: sus H2 son conceptuales («Decrypt-first is a footgun», «Why CBC+HMAC and not AES-GCM?») y no contienen pasos ordenados. Marcarlos como `HowTo` sería markup fabricado — exactamente lo que hace que los datos estructurados pierdan credibilidad. **Mantener la exclusión.**

**Trampa metodológica que afectó a las mediciones iniciales.** `/etc/hosts` fija `jmrp.io` a `::1`, de modo que cualquier `curl` ingenuo desde este servidor golpea el Nginx de origen por loopback y nunca toca Cloudflare. Las primeras cifras de TTFB (~14-17 ms) eran de origen. Forzando el edge real (`--resolve jmrp.io:443:104.21.40.251`), la mediana es **~58 ms**. Los números de Lighthouse de este informe siguen siendo del lado de origen y **excluyen RTT de red**: trátense como cota superior.

---

## Incidencias críticas

**Ninguna.** No hay rastreadores bloqueados, no hay contenido dependiente de JS, no hay `noindex` a nivel de dominio, no hay errores 5xx, no falta structured data. Para un sitio de este tipo es el titular correcto.

---

## Incidencias de prioridad alta

### A1 — No existe entidad Wikidata para el autor

_Convergente en tres agentes independientes; el hallazgo de mayor apalancamiento del informe._

Verificado en vivo vía `wbsearchentities`: cero resultados para «José Manuel Requena Plens» y para «Requena Plens». Los `sameAs` del nodo `#person` incluyen 14 plataformas (todas vivas, cero enlaces muertos) pero **ninguna es Wikipedia ni Wikidata**. Sin Q-id no hay nodo canónico al que los modelos puedan anclar el nombre, lo que limita la atribución por nombre por muy bueno que sea el contenido.

La base de notabilidad es defendible: ORCID `0000-0003-1250-6212`, 14 trabajos indexados, 13 DOI de Zenodo, tesis publicada, 8 afiliaciones institucionales, ponencias en EuroNoise 2021 y ECSSMET.

**Acción:** crear el ítem con P496 (ORCID), P1960 (Scholar `9b0kPaUAAAAJ`), P2037 (GitHub `jmrplens`), P856 (web oficial), P106, P108, P101. Después añadir el Q-id como `sameAs` y como segundo `identifier`. **Nota de implementación:** `identifier` es actualmente un objeto único, no un array — el sitio descarta silenciosamente cualquier segundo identificador. Hay que convertirlo en array primero.

### A2 — Las páginas en español emiten `@id` en inglés y colapsan dos documentos en una entidad

_Bug de código real, verificado en el JSON-LD servido._

`/es/blog/012-device-bound-key-derivation/` tiene como canonical `https://jmrp.io/es/blog/012-…/`, pero emite:

```
TechArticle @id       = https://jmrp.io/blog/012-device-bound-key-derivation/#article   (¡EN!)
            mainEntityOfPage = https://jmrp.io/blog/012-device-bound-key-derivation/    (¡EN!)
            inLanguage       = es
            headline         = "Un PIN de 4 dígitos basta: claves vinculadas al ESP32-S3"
```

Para cualquier consumidor esto es **una** entidad con dos titulares, dos idiomas y doce respuestas de FAQ, cuyo `mainEntityOfPage` apunta a una página que no es la suya. Lo mismo en la home ES (`WebPage @id https://jmrp.io/#webpage`, `url: "https://jmrp.io"`). Afecta a los 12 posts ES más la home ES.

`/es/about/` lo hace **bien** (`@id .../es/about/#profile`), lo que confirma que es un bug y no una decisión de diseño.

**Causa raíz y arreglo** (`translatePath` ya está en scope en la línea 41):

```ts
// src/components/pages/BlogPost.astro:117
- const postUrl = new URL(`/blog/${post.data.slug}/`, getSiteUrl()).href;
+ const postUrl = new URL(translatePath(`/blog/${post.data.slug}/`), getSiteUrl()).href;

// src/components/pages/HomePage.astro:120-121
+ "@id": new URL(`${translatePath("/")}#webpage`, getSiteUrl()).href,
+ url:   new URL(translatePath("/"), getSiteUrl()).href,
```

Y enlazar explícitamente las versiones con `workTranslation` / `translationOfWork`.

### A3 — Jerarquía de encabezados invertida en llms-full.txt

_Verificado: el arreglo de mayor valor por esfuerzo del informe._

Fuera de bloques de código el fichero tiene H1=1, **H2=178**, H3=271, H4=33 — pero **solo 2 de esos 178 H2 son secciones estructurales**. El resto son secciones internas de posts que quedan un nivel **por encima de su propio título**:

```
# jmrp.io — Full Context
## Blog Posts                              ← estructural
### Mastering Mutual TLS (mTLS) with Nginx ← TÍTULO del post
## Why mTLS? The Zero Trust Approach       ← CUERPO del post, por encima de su título
```

Cualquier pipeline de recuperación que trocee por límites de H2 —el comportamiento por defecto— **desprende cada sección de su artículo y pierde la atribución**.

**Acción:** en el generador de llms-full, degradar dos niveles los encabezados internos de cada post (`##`→`####`, `###`→`#####`).

### A4 — El corpus español es invisible para la capa llms.txt

_Verificado y reencuadrado._

`llms.txt` tiene 54 enlaces. 17 apuntan a `/es/` y **los 17 son herramientas: cero posts de blog en español**, mientras lista los 12 posts EN. `llms-full.txt` contiene solo 2 marcadores de texto español, es decir, prácticamente ningún cuerpo en español — pese a que el propio fichero afirma «all content available in both languages».

**Reencuadre importante:** verifiqué paridad estructural EN/ES completa — mismo número de preguntas FAQ, **mismos conjuntos de Q-ids de Wikidata**, `HowTo` en los mismos 9 de 12, `<TLDRSummary>` en 12/12 en ambos idiomas. El corpus ES no es de segunda categoría. Por tanto su invisibilidad ante la IA **no es un problema de marcado ni de calidad**: es un problema de **descubrimiento y autoridad**. Eso cambia el arreglo de «mejorar el marcado ES» a «declarar el ES en llms.txt y construir distribución en español».

### A5 — Enlazado interno casi inexistente

_El mayor lastre estructural, y el arreglo más barato de la lista._

Enlaces contextuales medidos dentro de `<article>`:

- **5 de 12 posts no enlazan a ningún otro post.** El máximo es uno.
- **Solo 1 de 12 enlaza a una herramienta relevante** (010 → `string-pool-packer`).
- El post 003 incrusta el constructor de CSP y **nunca enlaza** `/tools/csp-builder/`.
- El post 009 (Tor) es un huérfano topical: cero enlaces de entrada y de salida, pese a compartir CrowdSec con 005 y 006.

Catorce herramientas están a un enlace de doce posts que tratan exactamente de esas herramientas.

### A6 — Sin huella de discusión de terceros

Cero menciones en Reddit, Hacker News, Stack Overflow o el foro de MikroTik para ninguno de los 12 posts. Perplexity pondera fuertemente la corroboración comunitaria; sin ella, el contenido puede ser la mejor fuente de la web sobre un tema y aun así no recuperarse. Los candidatos más enlazables son los que ya rinden: 005 (tarpit) y 006 (honeypot) para r/mikrotik, r/selfhosted y r/homelab; 010 y 012 para r/embedded, r/esp32 y r/crypto.

### A7 — El HTML nunca se cachea en CDN

`cf-cache-status: DYNAMIC` en el 100 % de las respuestas HTML en el edge, frente a `HIT` (age 5545) en los assets `/_astro/`. Causa doble: `Cache-Control: no-store` (necesario para el nonce CSP por petición) **más** dos cabeceras `Set-Cookie`.

Es un compromiso deliberado y defendible por el nonce, pero el coste es real: un lector en Sídney o São Paulo suma ~250-350 ms a cada petición HTML, y eso cae directo sobre el LCP. Las mediciones de laboratorio de este informe lo ocultan porque corrieron sobre loopback.

**Dos opciones, elegir una:** (a) inyectar el nonce en el edge con un Worker de Cloudflare y permitir cachear el cuerpo HTML — más esfuerzo, mejor resultado; (b) pasar a CSP basada en hashes y eliminar `no-store` — Astro emite un conjunto fijo de bloques inline por build, así que los hashes son estables por despliegue.

---

## Incidencias de prioridad media

### M1 — Dos cabeceras `Set-Cookie` ficticias sin función alguna

```
add_header Set-Cookie "__Host-Session=1; path=/; Secure; HttpOnly; SameSite=Strict" always;
add_header Set-Cookie "__Secure-Pref=1;  path=/; Secure; HttpOnly; SameSite=Strict" always;
```

En `src/integrations/post-build/csp.ts:129-130`, generadas a `security_headers.conf:25-26`. Ambas fijadas a la constante `1`: sin sesión, sin preferencia, sin lector. Son sobrecarga pura en cada respuesta HTML y una razón **independiente** por la que se suprime el cacheo en CDN. La herramienta HTTP Headers Analyzer tiene su propia copia (`HTTPHeadersAnalyzer.astro:215-216`), así que eliminarlas no cuesta nada.

### M2 — CSS totalmente inline y nunca reutilizable

`build.inlineStylesheets: "always"` mete todo el UnoCSS dentro de cada documento: 63 KB en la home, 189 KB en `blog/003`, **239 KB en `tools/csp-builder`**. Sobre las 38 páginas rastreadas son ~4,1 MB de CSS inline, de los cuales **~1,27 MB son redundantes**. Como el HTML es `no-store`, nada de eso se reutiliza jamás.

Cambiar a `inlineStylesheets: "auto"` mueve las hojas grandes a `/_astro/`, que ya sirven con `max-age=31536000, immutable`. **No rompe la CSP**: `style-src 'self' 'nonce-…'` ya permite `<link rel="stylesheet">` del mismo origen; el nonce solo hace falta para `<style>` inline.

### M3 — Encuadre del TL;DR en 003, 007 y 008

Ver corrección #1. Reescribir título y viñetas como afirmaciones declarativas autocontenidas. Modelo a seguir, del post 005:

> «A tarpit drips data slowly (about 10 bytes/second) so malicious scanners stay stuck instead of instantly retrying like they do after a 403/404.»

### M4 — Encabezados en el cuerpo casi nunca con forma de pregunta

Media de **0,6 H2 interrogativos por post** (7 en todo el corpus de 12). El schema FAQ aporta las preguntas, pero el cuerpo ofrece muy pocos objetivos de extracción pregunta→respuesta, que es justo la forma de pasaje que levantan los sistemas de IA. Convertir 2-3 H2 por post donde el contenido ya responde a una pregunta.

### M5 — Cinco posts sin evidencia de despliegue en primera persona

Los posts 002, 003, 004, 005 y 007 tienen 2-3 marcadores de primera persona y ninguna narrativa de despliegue. Siguen siendo exactos y bien documentados, pero no llevan huella experiencial. El patrón a clonar existe ya en el post 001 («How I run this on my own infrastructure»). Caso más flagrante: el post 003 muestra el `BaseLayout.astro` **de este mismo sitio** implementando el truco del nonce y nunca dice que este sitio _es_ la implementación de referencia.

### M6 — La tarjeta de autor es idéntica y ciega al tema en los 12 posts

27 palabras genéricas, **sin enlace a `/about/`**, **sin enlace ORCID** (está en el JSON-LD pero no es clicable), y afirma credibilidad en acústica y firmware en un post sobre CSP de Nginx. Un lector que aterriza en el post 005 desde una búsqueda no encuentra ninguna razón en página para confiar en el autor sobre seguridad de red. Solución: tres variantes de bio según `articleSection`.

### M7 — Dispersión de etiquetas

28 etiquetas para 12 posts. **20 de 28 (71 %) contienen exactamente un post**, con 225-380 palabras cada una. Multiplicado por dos idiomas son ~40 URLs indexables casi vacías, cerca del 28 % del sitemap. Solo tienen ≥2 posts: Security(8), Nginx(6), MikroTik(3), Firmware(3), ESP32(3), IPv6(2), C++(2), Cryptography(2). Además, la etiqueta `key derivation` contiene un espacio literal, codificado como `%20` en un sitio y sin codificar en otro dentro de la misma página.

### M8 — Sin páginas pilar ni estructura de serie

Cuatro clusters coherentes (Nginx/seguridad web ×5, MikroTik/redes ×3, firmware embebido/cripto ×3, Tor/privacidad ×1) sin ninguna página hub, sin navegación de serie, sin «parte 1 de 3» en la trilogía Kleidos. CrowdSec aparece en 005, 006 y 009 como espina dorsal compartida y nunca se explota.

### M9 — Sin política de privacidad mientras se ejecuta analítica

El sitio carga un beacon de Cloudflare Web Analytics (self-hosted, sin cookies, sin peticiones a terceros — ambas cosas verificables) sin ninguna página que se lo diga al lector. Resulta llamativo en un sitio cuyas herramientas se presentan como «privacy-first, client-side only»: la afirmación se hace pero no se sustancia. Faltan también página de contacto y política editorial/de correcciones — esta última especialmente conspicua _porque_ existe divulgación explícita de asistencia por IA.

### M10 — `dateModified` sin semántica

7 de 12 posts nunca se han actualizado, y cuatro de esos siete (002, 004, 005, 007) son contenido sensible a versiones de Nginx/RouterOS. Solo 007 y 008 declaran «Tested on RouterOS 7.x with RB5009». Añadir un campo de frontmatter `Last verified / Tested on` con versiones exactas convierte un `dateModified` opaco en señal de confianza.

### M11 — Los posts 011 y 012 son estructuralmente planos

7.168 y 5.734 palabras con **cero subtítulos `<h3>`** (~380 palabras por encabezado). Necesitan subdivisión para granularidad de ToC y extracción de pasajes.

### M12 — Referencias sin anotar

Las fuentes son excelentes —RFC, IETF, NIST, IACR, docs de fabricante, 15 dominios externos distintos por post de media— pero se renderizan como una lista corrida de anchors sin editor, sin fecha y sin un «por qué esta fuente». Presenta como granja de enlaces lo que en realidad es una bibliografía de primera.

### M13 — `applicationCategory: "WebApplication"` en las 14 herramientas

Ese string es un nombre de _tipo_ de schema.org, no uno de los valores de categoría de Google. Las páginas de proyectos ya lo hacen bien (`DeveloperApplication`, `SecurityApplication`, `UtilitiesApplication`). Además, sin `aggregateRating` ni `review` las herramientas no son elegibles para el rich result de software — **no inventar valoraciones**; es una carencia legítima y permanente.

---

## Incidencias de prioridad baja

- **B1** — `/uses/` no emite **ninguna** entidad de página (única página del sitio así), pese a ser contenido de hechos estructurados que los motores de IA citan con gusto. Añadir `CollectionPage` + `ItemList`.
- **B2** — 11 referencias `@id` colgantes en 36 de 37 páginas: `Person.owns` apunta a `https://github.com/jmrplens/<repo>#software`, definido solo en `/projects/`. Acuñar los identificadores en un espacio de nombres propio.
- **B3** — Migas de pan en español mal formadas: posición 1 enraíza en la home **inglesa**, posición 2 es el segmento literal capitalizado `"Es"`.
- **B4** — Nombres de pasos `HowTo` que no aparecen en la página visible (5 de 8 en el post 003). Derivarlos del H2/H3 real o añadir anclas `url`.
- **B5** — `proficiencyLevel: "Beginner"` en el post 003, que es el más complejo del corpus (6.461 palabras, 75 encabezados). Debe ser `Intermediate`.
- **B6** — ~~`sameAs` omite dos perfiles vivos hallados en búsqueda.~~ **DESCARTADO por el titular**: no quiere esas redes referenciadas en ningún sitio. Que una auditoría encuentre perfiles no es razón para publicarlos — qué identidades se enlazan es decisión suya. Un test bloquea ahora su reaparición.
- **B7** — `/identity/person.jsonld` existe y coincide con `#person`, pero nada lo enlaza y no está en el sitemap.
- **B8** — Valores numéricos como strings: `image.width: "460"`, `offers.price: "0"`.
- **B9** — La imagen de `Person` hotlinkea `https://github.com/jmrplens.png` (fuera de origen, sin hash estable).
- **B10** — Sin cabecera `Link: </llms.txt>; rel="describedby"` — una línea de Nginx que hace descubribles los ficheros LLM sin adivinar la ruta.
- **B11** — Publicación 5 sin DOI ni `url`; publicaciones 13 y 14 sin `isPartOf`.
- **B12** — Longitud media de frase de 30-37 palabras en los posts 002, 003, 006 y 007. Objetivo 20-25: frases más cortas y autocontenidas son también las que la IA cita.
- **B13** — `CLAUDE.md` afirma que «Blog posts and tools content are not currently translated — MDX files exist only in English». **Es falso**: `src/content/posts/es/` contiene los 12 posts traducidos y `src/content/tools/es/` existe. Induce a error a futuros agentes.

---

## Análisis por categoría

### Citabilidad por IA — 86/100

El corpus está en el decil superior. Doce posts, media de 5.977 palabras (rango 3.674-8.677), TL;DR en 12/12, media de 5,8 preguntas FAQ por post, 15 dominios externos distintos por post, y hasta 68 bloques de código, 14 tablas y 101 SVG inline en un solo post.

Lo que más funciona son los bloques FAQ: respuesta primero, autocontenidos y cuantificados, espejados literalmente en `FAQPage`. Ejemplo verificado con paridad 6/6 entre JSON-LD y texto visible:

> «The iteration count must stay low enough that the legitimate user's unlock is bearable — about 2 seconds, which means 35,000 iterations on the ESP32-S3 and 25,000 on classic ESP32. OWASP's recommended 600,000 would push a single unlock to roughly 32 seconds on the S3 and 47 on classic ESP32, while a GPU still sweeps all 10,000 PINs in under a millisecond.»

El activo más diferenciado son las cifras propias que no existen en ninguna otra página: el post 010 publica un diseño experimental completo con firmware enlazado de las dos formas a cinco niveles de optimización, brazo de control LTO incluido — y un resultado que **contradice su propia premisa** («Plot twist: modern linkers already tail-merge string literals… so the packed blob is only 282 B smaller»).

Lo que lastra: densidad estadística muy desigual (1 token estadístico por 1.000 palabras en el post 003 frente a 28 en el 010), encabezados de cuerpo casi nunca interrogativos, y transiciones de relleno sin nada extraíble.

Un detalle notable: los diagramas se codifican tres veces en el DOM (`aria-label` en prosa + texto visual + tabla `sr-only`). Es **correcto** para accesibilidad y neto positivo para citabilidad —la tabla `sr-only` es la forma más extraíble—, pero significa que un extractor ve los datos de cada diagrama tres veces. **No corregir eliminando la tabla `sr-only`.**

### Autoridad de marca — 31/100

| Plataforma                             | Estado         | Evidencia                                                                              |
| -------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| Wikipedia                              | ❌ Ausente     | API: sin resultados para tres variantes del nombre                                     |
| Wikidata                               | ❌ Ausente     | `wbsearchentities`: sin Q-id para la persona                                           |
| ORCID                                  | ✅ Fuerte      | `0000-0003-1250-6212` — 14 trabajos, 8 empleos                                         |
| Google Scholar                         | ⚠️ Presente    | ID `9b0kPaUAAAAJ`, métricas no verificables (interstitial de bot)                      |
| ResearchGate                           | ✅ Presente    | 13 publicaciones, 2.622 lecturas, **solo 4 citas**                                     |
| GitHub                                 | ✅ Fuerte      | `jmrplens`, 24 repos; `gitlab-mcp-server` listado independientemente en mcpservers.org |
| LinkedIn                               | ✅ Presente    | `in/jmrplens`, corroborado por ORCID                                                   |
| Mastodon                               | ⚠️ Self-hosted | `mstdn.jmrp.io` — mismo dominio, aporta ~0 autoridad independiente                     |
| Reddit / HN / Stack Overflow / YouTube | ❌ Ausentes    | Sin huella                                                                             |

Las señales **en sitio** son excelentes: 14 `sameAs` todos vivos (cero enlaces muertos), `identifier` ORCID, 19 entradas `knowsAbout` resueltas a Q-ids, y 7 variantes de nombre en `alternateName` — buena desambiguación para un nombre acentuado y con variantes de guion. El sitio hace todo lo que puede; la pieza que falta es enteramente externa.

### Calidad de contenido E-E-A-T — 82/100

| Pilar         | Puntuación | Veredicto                                                                                      |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| Experiencia   | 21/25      | Práctica de primera mano genuina, concentrada en 7 de 12 posts                                 |
| Pericia       | 21/25      | Credenciales reales, profundas y legibles por máquina — desaprovechadas en la tarjeta de autor |
| Autoridad     | 18/25      | Higiene de citación excelente, enlazado interno casi nulo, sin validación externa              |
| Confiabilidad | 22/25      | Divulgación y honestidad sobre límites mejores que las de muchos editores comerciales          |

**Sin hallazgos críticos.** Para un sitio personal ese es el titular: el corpus está honestamente documentado, honestamente fechado, honestamente divulgado y libre de monetización (cero resultados para afiliados/patrocinio/donaciones en las 38 páginas; cero scripts de terceros).

La señal de confianza más creíble del sitio es la divulgación de una validación **inacabada**:

> «One footnote I owe you: My on-device validation of the eFuse-HMAC path is still pending a sacrificial dev board — burning an eFuse block is irreversible… What's pending is my hardware run, not the existence of the feature.»

Sobre señales de contenido generado por IA: se escanearon las 51.903 palabras del corpus buscando muletillas típicas de LLM. «delve into», «in today's digital landscape», «it's important to note», «In conclusion», «ever-evolving», «plays a crucial role», «seamlessly», «furthermore», «moreover», «utilize» → **cero ocurrencias de cada una**; «leverage» → 1. El corpus toma posiciones y nombra el compromiso en vez de hedgear. **Es trabajo humano experto con asistencia de IA en la redacción, exactamente como el autor declara.** La divulgación es la decisión correcta y debe mantenerse.

### GEO técnico — 97/100

La categoría más fuerte. En las 38 páginas: **0** shells de CSR, **0** blobs de hidratación, **0** `<main>` vacíos, **0** manejadores de eventos inline. Un rastreador sin JS (GPTBot, ClaudeBot, PerplexityBot) ve el **100 %** del contenido, y las respuestas de FAQ están verificadas en el cuerpo visible, no solo en el JSON-LD.

**Acceso de rastreadores verificado en el edge**, que es donde la mayoría de sitios falla en silencio: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Googlebot, bingbot, meta-externalagent y CCBot reciben todos un **200 idéntico con la carga completa de 681 KB**. `robots.txt` permite explícitamente 21 rastreadores de IA y declara `Content-Signal: search=yes, ai-input=yes, ai-retrieval=yes, ai-train=yes` — muy pocos sitios envían Content-Signal siquiera.

Cabeceras: HSTS, CSP nonce-only con `strict-dynamic`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, COOP/COEP/CORP, Permissions-Policy con 18 funciones deshabilitadas, zstd/br, h2 + h3 confirmados. Redirecciones de un solo salto sin cadenas. 404 real con `noindex`. Sitemap con 142/142 `lastmod` más alternates hreflang. `security.txt` RFC 9116 firmado con PGP y vigente. RSS válido. 45 imágenes, **0 sin `width`+`height`**, 666 `@font-face` **todas** con `font-display` — por eso el CLS es ~0.

Las dos deducciones son el cacheo de HTML (A7) y las cookies ficticias (M1).

### Schema y datos estructurados — 89/100

JSON-LD exclusivamente, un `@graph` por página, 9-21 nodos, **37/37 parsean sin errores**, servido en el HTML inicial. Cero Microdata, cero RDFa.

**Los 96 Q-ids de Wikidata del sitio se resolvieron en vivo: 96/96 correctos.** Cero erróneos, cero redirecciones. Esto es inusual y merece destacarse — los Q-ids mal asignados son un fallo habitual y aquí no hay ninguno.

Entidad canónica impecable: `https://jmrp.io/#person` se define una vez y se referencia por `@id` desde `author`, `publisher`, `creator`, `maintainer`, `mainEntity` y `about`. Sin nodo de identidad competidor. `speakable` presente en los 13 posts y ambas homes, con todos los selectores CSS resolviendo.

Las deducciones son la colisión de `@id` en español (A2), las referencias colgantes (B2), las migas ES (B3) y la ausencia de entidad de página en `/uses/` (B1).

### Optimización por plataforma — 77/100

| Plataforma          | Puntuación | Nota                                                         |
| ------------------- | ---------- | ------------------------------------------------------------ |
| Google AI Overviews | 84         | La única con extracción **demostrada**                       |
| Bing Copilot        | 82         | IndexNow + Bing API automáticos en cada despliegue           |
| ChatGPT Web Search  | 80         | Techo por ausencia de entidad                                |
| Perplexity          | 69         | Fuentes primarias excelentes, cero amplificación comunitaria |
| Google Gemini       | 68         | Sin ancla en el Knowledge Graph, sin YouTube                 |

**El hallazgo más importante del informe.** Pruebas de visibilidad en vivo:

| Consulta                                                             | Resultado                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mikrotik honeypot auto block port scanners`                         | **#1** — el resumen reprodujo la lógica del post (puertos trampa, `connection-state=new`, tabla RAW)                                                         |
| `nginx tarpit crowdsec slow down scanners`                           | **#1 y #2** — el resumen citó valores que solo existen en el post 005: estado 418, `limit_rate` ~10 bytes/s, `error_page 418 = @tarpit`                      |
| `packed i18n string pool firmware flash savings offset table`        | **#1** — el resumen citó «5,460 bytes of pointer index for 5×273 strings» y calificó el post como «the most authoritative and detailed source on this topic» |
| `encrypt-then-mac vault microcontroller ESP32 secure storage format` | **Ausente** — el post 011 cubre exactamente eso                                                                                                              |
| Consulta nativa en español sobre eFuse/PIN                           | **Ausente** — ninguna página ES apareció                                                                                                                     |

El sitio **ya gana citas de IA** en su cluster de Nginx/MikroTik/optimización de firmware, y es invisible en su cluster de criptografía embebida y en todo su corpus en español.

---

## Victorias rápidas (esta semana)

1. **Eliminar las dos `Set-Cookie` ficticias** de `csp.ts:129-130`. Dos líneas; quita sobrecarga de cada respuesta y una de las dos causas de la supresión de caché.
2. **Corregir el `@id` español** con `translatePath()` en `BlogPost.astro:117` y `HomePage.astro:120-121`. Una línea y media; arregla 13 páginas y elimina la colisión de entidades.
3. **Degradar dos niveles los encabezados internos** en el generador de llms-full.txt. Arregla la atribución en todo pipeline RAG que trocee por H2.
4. **Añadir los 12 posts ES a llms.txt** y separar `## Developer Tools` en secciones EN y ES. Declara la mitad del sitio que hoy es invisible.
5. **Reescribir el TL;DR de 003, 007 y 008** como afirmaciones declarativas, con el post 005 como modelo. Solo texto, sin cambios de código.
6. **Añadir enlaces contextuales a herramientas**: 003→csp-builder, 001→cert-inspector, 007→wireguard-config-generator, 008→subnet-calculator, 002/004/005→nginx-config-generator + http-headers-analyzer.
7. **Corregir el párrafo de i18n en `CLAUDE.md`**, que hoy afirma lo contrario de la realidad.

---

## Plan de acción a 30 días

### Semana 1 — Arreglos de código de alto apalancamiento

- [ ] `translatePath()` en `BlogPost.astro:117` y `HomePage.astro:120-121`; verificar el `@id` de las 12 páginas ES
- [ ] Añadir `workTranslation` / `translationOfWork` entre pares EN↔ES
- [ ] Eliminar las dos `Set-Cookie` ficticias
- [ ] Convertir `Person.identifier` de objeto a array (prerrequisito de A1)
- [ ] Corregir jerarquía de encabezados en el generador de llms-full.txt
- [ ] Añadir los posts ES a llms.txt; separar herramientas por idioma
- [ ] Corregir el párrafo de i18n en `CLAUDE.md`

### Semana 2 — Entidad y autoridad

- [ ] Crear el ítem de Wikidata (P496, P1960, P2037, P856, P106, P108, P101)
- [ ] Añadir el Q-id a `sameAs` y como segundo `identifier`
- [ ] Añadir `x.com/jmrplens` y `ko-fi.com/jmrplens` a `site.yaml`
- [ ] Enlazar `/identity/person.jsonld` desde `BaseHead.astro` y exponerlo en llms.txt
- [ ] Publicar los posts 005 y 006 en r/mikrotik, r/selfhosted y r/homelab; 010 y 012 en r/embedded y r/esp32
- [ ] Responder preguntas existentes sobre PPPoE dual-stack citando el post 008

### Semana 3 — Estructura de contenido

- [ ] Reescribir el TL;DR de 003, 007 y 008 como afirmaciones autocontenidas
- [ ] Añadir bloque «Relacionado en este sitio» (3-5 ítems curados) a los 12 posts
- [ ] Enlaces contextuales a herramientas en los 12 posts
- [ ] Rescatar el post 009 del aislamiento enlazándolo desde 005, 006 y `/homelab/`
- [ ] Convertir 2-3 H2 por post a forma interrogativa donde el contenido ya responde
- [ ] Añadir subtítulos `<h3>` a los posts 011 y 012

### Semana 4 — Confianza, consolidación y pilares

- [ ] Publicar `/privacy/` documentando el beacon self-hosted; enlazar en el pie
- [ ] Publicar política editorial y de correcciones en `/about/#editorial`
- [ ] Añadir campo de frontmatter `Last verified / Tested on` y rellenarlo en los 12 posts
- [ ] Consolidar 28 etiquetas a ~12; renombrar `key derivation` → `key-derivation`; añadir prosa introductoria por etiqueta
- [ ] Añadir esquema `CollectionPage` + `ItemList` a `/uses/`
- [ ] Corregir `applicationCategory` en las 14 herramientas a valores de categoría de Google
- [ ] Corregir `proficiencyLevel` del post 003 a `Intermediate`
- [ ] Crear las tres páginas pilar: Nginx hardening, MikroTik dual-stack, trilogía Kleidos

### Más allá de 30 días

- [ ] Decidir el compromiso nonce vs caché en el edge (Worker de Cloudflare o CSP por hashes)
- [ ] `inlineStylesheets: "auto"`
- [ ] Reverificar los posts 002, 004, 005 y 007 contra Nginx actual
- [ ] Contenido sin escribir de mayor valor, ya evidenciado en el CV: Modbus sobre STM32 (80 %→17 % de CPU a 40k req/s), testing embebido con Ceedling, ajuste de pila de FreeRTOS, y acústica/DSP vía `phonometry` — que `about.html` promete bajo «I write about» y sobre lo que no existe ni un post

---

## Apéndice: composición del sitio

| Tipo de URL                 | Por idioma | Total | Palabras (rango) |
| --------------------------- | ---------- | ----- | ---------------- |
| Páginas de etiqueta de blog | 28         | 56    | 225-380          |
| Páginas de herramienta      | 17         | 34    | 988-1.864        |
| Posts de blog               | 12         | 24    | 3.674-8.677      |
| Páginas estáticas           | 6          | 12    | 454-4.332        |
| Categorías de herramientas  | 5          | 10    | 225-379          |
| Índices (home, blog, tools) | 3          | 6     | 512-692          |

**Fechas de publicación:** 001 2025-12-16 (act. 2026-07-15) · 002 2025-12-18 · 003 2025-12-19 (act. 2026-02-06) · 004 2026-01-14 · 005 2026-01-16 · 006 2026-01-19 · 007 2026-02-14 · 008 2026-02-15 (act. 2026-07-07) · 009 2026-03-30 · 010 2026-06-10 (act. 2026-06-21) · 011 2026-06-16 · 012 2026-06-22

Cadencia: 12 posts en 6,2 meses (~1,9/mes), con dos huecos visibles: 2026-03-30 → 2026-06-10 (10 semanas) y 2026-06-22 → hoy (5,7 semanas, en curso). El corpus **no está obsoleto**.

**Limitaciones de esta auditoría.** No hay datos de campo (CrUX); Lighthouse corrió contra origen por loopback, así que su LCP excluye RTT de red — el hallazgo A7 es precisamente el hueco que esos números ocultan. El tamaño de objetivos táctiles no se midió (requiere layout renderizado). La ausencia de menciones en Reddit/HN refleja lo que emergió en búsqueda: es evidencia fuerte de baja visibilidad, no prueba de inexistencia. El estado de verificación en Bing Webmaster y la _aceptación_ de IndexNow (frente a su envío) no son verificables externamente; sí se confirmó que existe el fichero de clave y la ruta de código en `deploy-live.mjs`.

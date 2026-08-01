/**
 * Spanish translations — editorial series hubs.
 *
 * Original framing copy for the curated topic hubs defined in
 * `src/utils/series.ts`. Kept in its own namespace because the prose runs to
 * ~900 words per series and would drown the shared UI strings in `common.ts`.
 * Keys follow dot-notation: `t("series.nginx-hardening.why1")`.
 */
export const series = {
  ui: {
    kicker: "// SERIE",
    partLabel: "Parte {position}",
    articlesLabel: "Artículos de esta serie",
    countLabel: "{count} artículos",
    moreTitle: "Otras series",
    backToBlog: "← Volver a todos los posts",
    indexTitle: "Series",
    indexDescription:
      "Itinerarios de lectura por el blog: endurecer Nginx, red MikroTik dual-stack e ingeniería de firmware sobre un ESP32-S3.",
    indexLead:
      "Algunos artículos de aquí se escribieron como conjunto. Una página de etiqueta solo puede listarlos; estas páginas pilar explican por qué existe el grupo, en qué orden leerlo y qué decisión resuelve cada pieza.",
    indexListLabel: "Series editoriales",
  },

  "nginx-hardening": {
    title: "Endurecer Nginx, desde el borde hacia dentro",
    description:
      "Cinco guías de Nginx en orden de lectura: mTLS, CSP, HTTP/3, ficheros virtuales y un tarpit — un borde endurecido decisión a decisión.",
    lead: "Cinco guías que suelen leerse como recetas sueltas. En este orden son un solo proyecto: llevar un Nginx público desde sirve TLS hasta decide quién puede abrir una conexión, qué puede ejecutar su navegador, cómo viajan los bytes, qué parte del disco es alcanzable y qué ocurre con lo que sigue siendo hostil.",
    whyTitle: "Por qué estas cinco van juntas",
    why1: "Cada uno de estos artículos responde a una pregunta que solo queda bien planteada cuando la anterior está resuelta. Limitar la tasa de una petición es un problema distinto según sepas o no quién la envía. Elegir una Content Security Policy es un problema distinto según las páginas que sirves salgan de disco o se sinteticen. Una configuración no está endurecida porque acumule directivas: lo está porque se tomó una secuencia de decisiones en un orden en el que cada una acota a la siguiente.",
    why2: "Comparten además una espina dorsal que se pierde al leerlos por separado: empujar cada decisión tan pronto en la ruta de la petición como sea posible. El TLS mutuo rechaza durante el handshake, antes de analizar un solo byte de HTTP. La CSP saca una decisión de ejecución del servidor y la lleva al navegador, que es donde aterriza el ataque. QUIC baja la recuperación de pérdidas por debajo de HTTP para que un paquete perdido deje de bloquear flujos ajenos. Un fichero virtual responde sin consultar el sistema de ficheros. Un tarpit gasta el presupuesto de conexiones del atacante en vez del tuyo. El mismo instinto, cinco capas.",
    why3: "Lo último que tienen en común es la procedencia. Las cinco cosas corren en la máquina que sirve esta página. Los bloques de configuración están citados de un servidor en producción, no montados para el artículo; los números de versión son los que están desplegados; y el tráfico del que habla el artículo del tarpit es tráfico que llegó a este host. Por eso también merece la pena leer la serie en orden en lugar de ojearla: los compromisos que se describen hubo que convivir con ellos, no se propusieron y abandonaron.",
    orderTitle: "Léelas en este orden",
    orderIntro:
      "Cada entrada indica qué decide y qué da por supuesto. Se sostienen solas si solo necesitas una, pero el orden es aquel en el que las decisiones se condicionan de verdad entre sí.",
    afterTitle: "Hacia dónde sigue esto",
    after1:
      "La continuación natural va hacia abajo, a la red sobre la que se apoya el servidor web: el router que termina el enlace del ISP, reparte las direcciones a las que se atan estos virtual hosts y descarta la mayor parte del tráfico hostil antes de que Nginx vea siquiera un SYN. Esa es otra serie, enlazada más abajo.",
    after2:
      "Hacia arriba, la continuación es operativa más que arquitectónica. Ninguna de estas cinco decisiones sobrevive sin una forma de enterarse cuando se rompe: una CSP que bloquea en silencio un script legítimo, un certificado de cliente que caduca sin avisar, un listener de HTTP/3 que una actualización de firmware dejó de reenviar. Cada artículo termina con la comprobación concreta que detecta su propio modo de fallo, y esas comprobaciones merecen ir al sistema de monitorización en lugar de ejecutarse a mano una vez.",
    limitsTitle: "Qué no cubre esta serie",
    limits1:
      "Aquí no hay ningún firewall de aplicación ni ajuste de conjuntos de reglas. Es una omisión deliberada: un WAF es un comparador de patrones atornillado encima de las decisiones que estos cinco artículos toman estructuralmente, y recurrir a él primero suele tapar un borde que nunca se acotó bien. Tampoco hay capítulo de ingress controller: las configuraciones están escritas para un Nginx que administras directamente, y traducirlas a un recurso anotado de Kubernetes es otro ejercicio con otros modos de fallo.",
    notes: {
      p001: "Empieza aquí, porque es la única decisión que cambia quién puede abrir una conexión siquiera. Todo lo que viene después —cabeceras, enrutado, límites de tasa— es una conversación con alguien a quien ya has admitido. El artículo monta una autoridad certificadora, emite certificados de cliente y luego dedica la mayor parte de su extensión a lo que las guías cortas se saltan: la revocación. CRL y OCSP son el punto en el que el TLS mutuo pasa de ser un flag de configuración a un compromiso operativo, porque emitir credenciales es fácil y retirarlas es lo que de verdad vas a necesitar con prisa.",
      p003: "Con la conexión ya legítima, la siguiente decisión es qué puede ejecutar el navegador con lo que le mandas. Aquí es donde se atasca la mayoría de los intentos de endurecimiento: la política ingenua o rompe el sitio o contiene un comodín que la vuelve decorativa. Es el artículo más largo de los cinco y el que documenta más modos de fallo: nonces frente a hashes, cómo strict-dynamic cambia lo que significa tu lista de permitidos, y cómo se puede saltar una política que aun así puntúa bien en un informe. Léelo antes de tocar el transporte: un sitio rápido con una política inaplicable es el intercambio equivocado.",
      p004: "El transporte va en tercer lugar porque cambia el rendimiento y el comportamiento ante fallos, no quién entra. QUIC sustituye el handshake de TCP+TLS por uno con menos vueltas y cifrado casi de extremo a extremo, y HTTP/3 elimina el bloqueo de cabecera de línea que hacía que un solo paquete perdido detuviera todos los flujos de la conexión. El artículo cubre lo que muerde en producción: los requisitos de compilación, el baile del anuncio Alt-Svc y la advertencia sobre la repetición en 0-RTT, que es un problema de corrección y no un parámetro de ajuste.",
      p002: "El artículo más corto y la reducción de superficie de ataque más barata de los cinco. Una respuesta que el servidor sintetiza no tiene una ruta detrás, así que no hay nada que recorrer, enlazar simbólicamente ni condicionar por carrera. Es además donde root frente a alias frente a try_files se vuelve por fin concreto: tres directivas responsables de buena parte de la exposición accidental de ficheros en configuraciones reales de Nginx, porque su diferencia es una barra final y un cambio silencioso de semántica. Léelo después de los tres primeros: es la pieza que hace más pequeña la superficie que acabas de endurecer.",
      p005: "La última pregunta es qué hacer con el tráfico al que se le ha negado todo lo anterior y sigue llegando. Un tarpit responde despacio a propósito, mantiene abierta la conexión del escáner y consume su presupuesto de concurrencia en vez de tu CPU, y luego alimenta con esas direcciones una lista de bloqueo que aplican las capas anteriores. Va al final a propósito: da por hecho que las decisiones previas ya están tomadas, y es la única de las cinco cuya eficacia puedes ver ocurrir en un log en tiempo real.",
    },
  },

  "mikrotik-dual-stack": {
    title: "MikroTik dual-stack, del ISP al cortafuegos",
    description:
      "Tres guías de RouterOS: una VPN WireGuard dual-stack, PPPoE con delegación de prefijo DHCPv6 y un honeypot que bloquea escáneres solo.",
    lead: "Tres configuraciones de RouterOS que juntas describen un router que funciona: IPv6 nativo entregado por el ISP, una VPN que lleva a casa ambas familias de direcciones y un cortafuegos que convierte el escaneo no solicitado en un bloqueo automático. Escritas contra hardware real en una línea de fibra española real, no en un laboratorio.",
    whyTitle: "Por qué estas tres van juntas",
    why1: "IPv6 falla de una forma concreta y frustrante en las conexiones domésticas: todo parece configurado y nada acaba de funcionar. Llega un prefijo pero no se delega hacia dentro. Los clientes obtienen dirección pero no ruta por defecto. La VPN conecta y el túnel solo lleva v4. Cada uno de estos artículos arregla un eslabón de esa cadena, y la razón para leerlos como conjunto es que depurar cualquiera de ellos por separado suele terminar en descubrir que en realidad tienes un problema de otro.",
    why2: "El sustrato común es el propio RouterOS, que es un modelo de cortafuegos genuinamente distinto de la imagen mental de iptables que asumen la mayoría de las guías. Las listas de direcciones son objetos de primera clase que las reglas leen y escriben, la tabla RAW existe para descartar tráfico antes de que el seguimiento de conexiones gaste memoria en él, y las listas de interfaces permiten que una regla cubra un conjunto que cambia. Los tres artículos se apoyan en esas primitivas, así que el segundo y el tercero se vuelven bastante más fáciles cuando el primero ya las ha presentado.",
    why3: "Lo último que los une es que son dual-stack en sentido estricto, no configuraciones de IPv4 con IPv6 añadido al final. Cada regla de cortafuegos aparece en ambas familias, cada lista de direcciones tiene su homóloga en v6, y los puntos en los que las dos difieren de verdad —no hay NAT tras el que esconderse, un prefijo que puede cambiarte debajo, ICMPv6 que no debes filtrar a ciegas— se señalan donde importan y no en una nota al pie.",
    orderTitle: "Léelas en este orden",
    orderIntro:
      "El orden de abajo es el que coincide con cómo llega la gente de verdad: con una conexión que funciona y una VPN que quiere montar. Si partes de un router sin IPv6 ninguno, lee antes la segunda entrada: es la que pone un prefijo delegado real en el WAN, que la primera da por hecho.",
    afterTitle: "Hacia dónde sigue esto",
    after1:
      "Por encima está el servidor web al que reenvía el router, que tiene su propia serie de decisiones sobre a quién admite y qué ejecuta. Por debajo no queda mucho: esto es el borde. Lo que queda es operativo: un prefijo que cambia tras una incidencia de línea y deja tus reglas de cortafuegos desalineadas con la realidad, un peer de VPN que deja de renegociar claves en silencio, una lista de direcciones que crece sin límite porque nada caduca sus entradas.",
    after2:
      "El artículo del honeypot es además el puente natural hacia las herramientas de listas de bloqueo que se usan en el resto del sitio. Las direcciones que recoge son la misma clase de tráfico que ve el tarpit del servidor web; tener los dos significa que al mismo escáner se le rechaza en dos capas, y la capa del router es la que no cuesta nada aplicar.",
    limitsTitle: "Qué no cubre esta serie",
    limits1:
      "Aquí no hay ningún protocolo de enrutado: ni BGP, ni OSPF, ni conmutación entre varios WAN. Una línea residencial con una sola salida y un prefijo delegado es un alcance deliberadamente estrecho, y es el alcance en el que los detalles de dual-stack son lo bastante difíciles como para merecer que se escriban. Tampoco hay capítulo de CAPsMAN ni de wifi: la parte inalámbrica de un despliegue MikroTik es un tema aparte que casi no comparte razonamiento con esto.",
    notes: {
      p007: "La pieza a la que llega la mayoría, y la que enuncia las suposiciones de direccionamiento que el resto de la serie existe para satisfacer. WireGuard en RouterOS se pone a funcionar rápido para IPv4 y luego queda calladamente incompleto: el túnel levanta, el tráfico fluye, y todo destino IPv6 detrás es inalcanzable. El artículo configura ambas familias de punta a punta: direccionamiento de la interfaz, allowed-IPs en cada lado, las reglas de cortafuegos que dejan al túnel hablar con la LAN y el comportamiento de DNS que decide si el cliente usa de verdad el camino v6 que ahora tiene.",
      p008: "Aquí es de donde salen las direcciones. En la fibra española de DIGI el WAN es PPPoE dentro de una VLAN etiquetada, e IPv6 llega como un prefijo delegado por DHCPv6 y no como una dirección suelta, lo que obliga al router a pedirlo, conservarlo y repartir subredes a partir de él, y todo eso tiene que sobrevivir a que el prefijo cambie. El artículo cubre el etiquetado VLAN, el cliente PPPoE, la delegación de prefijo, SLAAC en el lado LAN y las reglas de cortafuegos que un WAN dual-stack necesita antes de que sea seguro dejarlo funcionando.",
      p006: "Con el enlace levantado y el túnel funcionando, la última decisión es qué hacer con todo lo que lo escanea. El honeypot escucha en puertos que nada legítimo tocaría, y un intento de conexión se considera prueba suficiente: el origen cae en una lista de direcciones y la tabla RAW descarta su tráfico antes de que el seguimiento de conexiones le reserve nada. Léelo el último: es el único de los tres que presupone un router direccionado y en marcha, y el único cuyo efecto puedes ver acumularse en una lista durante los días siguientes.",
    },
  },

  "kleidos-firmware": {
    title: "Firmware de Kleidos: tres decisiones bajo restricciones duras",
    description:
      "Tres análisis de un gestor de contraseñas hardware sobre ESP32-S3: cadenas i18n empaquetadas, bóveda encrypt-then-MAC y claves ligadas al dispositivo.",
    lead: "Tres decisiones de ingeniería de Kleidos, un gestor de contraseñas hardware construido sobre un ESP32-S3. Sin sistema operativo en el que delegar, sin red a la que llamar, sin permisos de sistema de ficheros tras los que esconderse y con un presupuesto de flash que hace que cada elección de diseño cueste algo visible. Leídas juntas muestran qué aspecto tiene la ingeniería de seguridad cuando no están disponibles las salidas de emergencia habituales.",
    whyTitle: "Por qué estas tres van juntas",
    why1: "Cada artículo aísla una decisión y la sigue hasta la medición que la justificó. Es deliberado: en un microcontrolador casi toda elección interesante es un intercambio contra un presupuesto fijo —bytes de flash, RAM, milisegundos, entropía— y una decisión defendida en abstracto suele ser una decisión que nunca se pagó de verdad. Los números de estos artículos son los de la compilación, incluidos los que salieron peor de lo esperado.",
    why2: "El dispositivo vuelve además el modelo de amenaza inusualmente concreto. Un gestor de contraseñas hardware es una cosa que un atacante puede tener en la mano. Ese único hecho elimina la mayoría de las suposiciones sobre las que se apoya la literatura general de seguridad: no hay un servidor de confianza que limite la tasa del atacante, no hay una cuenta que bloquear, no hay un llavero del sistema operativo al que delegar y no hay forma de guardar un secreto por el mero hecho de no escribirlo, porque el atacante puede leer la flash. Dos de los tres artículos son consecuencia directa de eso.",
    why3: "El tercer hilo es que ninguna de estas decisiones se tomó aislada de las otras. El pool compacto de cadenas existe en parte porque el trabajo criptográfico necesitaba la flash que liberó. El paso de autenticación del formato de bóveda es lo que hace que el comportamiento fail-closed de la derivación de claves sea observable y no teórico. Leerlos en orden enseña el presupuesto moviéndose de un subsistema a otro, que es la parte del trabajo embebido que rara vez sobrevive hasta el texto final.",
    orderTitle: "Léelas en este orden",
    orderIntro:
      "El orden va de la restricción más barata de entender a la de consecuencias más afiladas. Cada entrada indica qué decisión resuelve.",
    afterTitle: "Hacia dónde sigue esto",
    after1:
      "Las siguientes preguntas obvias son las de la frontera del dispositivo más que las de su interior: cómo se autentican las actualizaciones de firmware, cómo interactúan el arranque seguro y el cifrado de flash con el secreto en eFuse del que depende el tercer artículo, y qué puede recuperar todavía un atacante con acceso físico y un laboratorio. Merecen sus propios artículos y no un párrafo aquí, porque las respuestas honestas hablan de límites, no de soluciones.",
    after2:
      "Kleidos es un proyecto privado y su repositorio no es público, así que estos artículos llevan el razonamiento y las mediciones en lugar de un enlace para clonar. Todo lo descrito es reproducible desde el propio artículo: el generador del pool de cadenas es un script de compilación cuyo algoritmo está detallado, y las construcciones criptográficas son primitivas estándar compuestas en un orden que se enuncia, que es la parte que importa y la que más veces se hace mal.",
    limitsTitle: "Qué no cubre esta serie",
    limits1:
      "No hay capítulo de hardware —ni esquemático, ni carcasa, ni cadena de suministro— ni de diseño de interfaz. El alcance son decisiones de firmware con consecuencia de seguridad o de recursos, y por eso no aparecen por ningún lado ni el driver de la pantalla ni la rutina antirrebotes de los botones, que dieron trabajo real. Tampoco es una serie de tutoriales: ninguno de los tres artículos es una guía paso a paso, y seguirlos requiere estar cómodo con C++ sobre metal desnudo y con el vocabulario de la criptografía aplicada.",
    notes: {
      p010: "Empieza por el presupuesto de flash, porque es la restricción que da forma a todo lo demás. Un dispositivo con interfaz en cinco idiomas almacena muchísimas cadenas cortas, y la representación ingenua —un array de punteros por idioma— gasta una fracción sorprendente de su coste en los punteros y no en el texto. El artículo recorre un generador de tiempo de compilación que empaqueta todas las traducciones en un único blob direccionado por offsets de 16 bits, deduplicando las cadenas idénticas entre idiomas, y cuenta lo que eso ahorró de verdad. Es también la entrada más suave: nada de criptografía, solo una medición y un generador.",
      p011: "Después, el fichero para el que existe el dispositivo. Una bóveda que descifra antes de autenticar procesará encantada las modificaciones de un atacante, y en un microcontrolador las consecuencias de analizar texto plano controlado por el atacante no son abstractas. El artículo cubre encrypt-then-MAC, por qué el MAC se verifica sobre el texto cifrado antes de descifrar un solo byte, y cómo se estructura la ruta de lectura para que cualquier fallo —truncamiento, un bit cambiado, un fichero sustituido— termine en un rechazo y no en un resultado parcial. Fail-closed es una propiedad de la ruta de código, no de la intención, y este es el artículo que enseña la diferencia.",
      p012: "Por último, la clave que la abre. El usuario elige un PIN de cuatro dígitos, y ningún número de iteraciones salva a un secreto de cuatro dígitos frente a un atacante que tiene el contenido de la flash y una máquina de escritorio: el espacio de claves entero son diez mil candidatos. La respuesta es hacer imposible la derivación fuera del dispositivo mezclando un secreto que nunca sale de él —una clave HMAC respaldada por eFuse que la CPU puede usar pero no leer— y pasarlo por HKDF junto con el PIN. El artículo explica por qué esto es un argumento de ligadura al dispositivo y no de fortaleza, y es franco sobre lo que no protege.",
    },
  },
};

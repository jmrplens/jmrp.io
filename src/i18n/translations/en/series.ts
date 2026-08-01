/**
 * English translations — editorial series hubs.
 *
 * Original framing copy for the curated topic hubs defined in
 * `src/utils/series.ts`. Kept in its own namespace because the prose runs to
 * ~900 words per series and would drown the shared UI strings in `common.ts`.
 * Keys follow dot-notation: `t("series.nginx-hardening.why1")`.
 */
export const series = {
  ui: {
    kicker: "SERIES",
    partLabel: "Part {position}",
    articlesLabel: "Articles in this series",
    countLabel: "{count} articles",
    moreTitle: "Other series",
    backToBlog: "← Back to all posts",
    indexTitle: "Series",
    indexDescription:
      "Curated reading paths through the blog: Nginx hardening, dual-stack MikroTik networking, and firmware engineering on an ESP32-S3.",
    indexLead:
      "Some articles here were written as a set. A tag page can only list them; these hubs say why the cluster exists, in what order to read it, and which decision each piece settles.",
    indexListLabel: "Editorial series",
  },

  "nginx-hardening": {
    title: "Hardening Nginx, edge inward",
    description:
      "Five Nginx guides in reading order: mTLS, CSP, HTTP/3, virtual files and a tarpit — one edge hardened decision by decision.",
    lead: "Five guides that are usually read as separate recipes. Taken in this order they are one project: moving a public Nginx server from it serves TLS to it decides who may open a connection, what their browser may execute, how the bytes travel, how little of the disk is reachable, and what happens to whatever is still hostile.",
    whyTitle: "Why these five belong together",
    why1: "Every one of these articles answers a question that only becomes well-posed once the previous one is settled. Rate limiting a request is a different problem depending on whether you know who sent it. Choosing a Content Security Policy is a different problem depending on whether the pages you serve come from disk or are synthesized. A configuration is not hardened because it accumulated directives; it is hardened because a sequence of decisions was made in an order where each one narrows the next.",
    why2: "They also share a spine that is easy to miss when they are read individually: push every decision as early in the request path as it will go. Mutual TLS rejects during the handshake, before a single HTTP byte is parsed. CSP moves an execution decision out of your server and into the browser, where the attack actually lands. QUIC moves loss recovery below HTTP so a single lost packet stops stalling unrelated streams. A virtual file answers without a filesystem lookup. A tarpit spends the attacker's connection budget instead of yours. Same instinct, five layers.",
    why3: "The last thing they have in common is provenance. All five run on the machine serving this page. The configuration blocks are quoted from a production server rather than assembled for the article, the version numbers are the ones actually deployed, and the traffic discussed in the tarpit piece is traffic that arrived at this host. That is also why the series is worth reading in order rather than skimmed: the trade-offs described are ones that had to be lived with, not ones proposed and abandoned.",
    orderTitle: "Read in this order",
    orderIntro:
      "Each entry below states what it decides and what it assumes. They stand alone if you only need one, but the order is the one in which the decisions genuinely constrain each other.",
    afterTitle: "Where this goes next",
    after1:
      "The natural continuation is downward, into the network the web server sits on: the router that terminates the ISP link, hands out the addresses these virtual hosts bind to, and drops most hostile traffic before Nginx ever sees a SYN. That is a separate series, linked below.",
    after2:
      "Upward, the continuation is operational rather than architectural. None of these five decisions survives without a way to notice when it breaks: a CSP that silently blocks a legitimate script, a client certificate quietly expiring, an HTTP/3 listener that a firmware update stopped forwarding. Each article ends with the specific check that catches its own failure mode, and those checks are worth wiring into monitoring rather than running by hand once.",
    limitsTitle: "What this series does not cover",
    limits1:
      "There is no web application firewall here and no rule-set tuning. That is a deliberate omission: a WAF is a pattern matcher bolted on top of decisions that these five articles make structurally, and reaching for one first tends to paper over an edge that was never constrained properly. There is also no ingress-controller chapter — the configurations are written for an Nginx you administer directly, and translating them into an annotated Kubernetes resource is a different exercise with different failure modes.",
    notes: {
      p001: "Start here, because this is the only decision that changes who can open a connection at all. Everything after it — headers, routing, rate limits — is a conversation with a party you already admitted. The article builds a certificate authority, issues client certificates, and then spends most of its length on the part shorter guides skip: revocation. CRL and OCSP are where mutual TLS becomes an operational commitment rather than a configuration flag, because issuing credentials is easy and withdrawing them is the part you will actually need under pressure.",
      p003: "With the connection legitimate, the next decision is what the browser may execute with what you send it. This is where most hardening attempts stall: the naive policy either breaks the site or contains a wildcard that makes it decorative. It is the longest article of the five, and the one with the most documented failure modes — nonce versus hash strategies, how strict-dynamic changes what your allowlist even means, and how a policy that scores well on a report card can still be bypassed. Read it before you touch the transport layer; a fast site with an unenforceable policy is the wrong trade.",
      p004: "Transport comes third because it changes performance and failure behavior, not who is allowed in. QUIC replaces the TCP+TLS handshake with one that is fewer round trips and encrypted almost end to end, and HTTP/3 removes the head-of-line blocking that made a single lost packet stall every stream on a connection. The article covers the parts that bite in production: the build requirements, the Alt-Svc advertisement dance, and the 0-RTT replay caveat, which is a correctness problem and not a tuning knob.",
      p002: "The shortest article, and the cheapest reduction in attack surface of the five. A response the server synthesizes has no path behind it, so there is nothing to traverse, symlink, or race. It is also where root versus alias versus try_files finally becomes concrete — three directives responsible for a large share of accidental file exposure in real Nginx configurations, because their difference is one trailing slash and a silent semantic change. Read it after the first three: it is the piece that makes the surface you just hardened smaller.",
      p005: "The final question is what to do with the traffic that has been refused everything above and keeps arriving. A tarpit answers deliberately slowly, holding the scanner's connection open and consuming its concurrency budget rather than your CPU, then feeds the offending addresses into a blocklist that the earlier layers enforce. It is last on purpose: it assumes the decisions before it are already in place, and it is the only one of the five whose effectiveness you can watch happen in a log in real time.",
    },
  },

  "mikrotik-dual-stack": {
    title: "Dual-stack MikroTik, from the ISP to the firewall",
    description:
      "Three RouterOS guides: a dual-stack WireGuard VPN, PPPoE with DHCPv6 prefix delegation, and a honeypot that auto-blocks scanners.",
    lead: "Three RouterOS configurations that together describe one working router: native IPv6 delivered by the ISP, a VPN that carries both address families home, and a firewall that turns unsolicited scanning into an automatic block. Written against real hardware on a real Spanish fibre line, not a lab.",
    whyTitle: "Why these three belong together",
    why1: "IPv6 fails in a specific and frustrating way on consumer connections: everything appears configured, and nothing quite works. A prefix arrives but is not delegated onward. Clients get an address but no default route. The VPN connects and the tunnel carries v4 only. Each of these articles fixes one link in that chain, and the reason to read them as a set is that debugging any one of them in isolation usually means discovering you actually have a problem from one of the others.",
    why2: "The shared substrate is RouterOS itself, which is a genuinely different firewall model from the iptables mental picture most guides assume. Address lists are first-class objects that rules both read and write, the RAW table exists to drop traffic before connection tracking spends memory on it, and interface lists let one rule cover a set that changes. All three articles lean on those primitives, so the second and third get considerably easier once the first has introduced them.",
    why3: "The last thing tying them together is that they are dual-stack in the strict sense, not IPv4 configurations with IPv6 added at the end. Every firewall rule appears in both address families, every address list has a v6 counterpart, and the places where the two genuinely differ — no NAT to hide behind, a prefix that can change under you, ICMPv6 that you must not filter blindly — are called out where they matter rather than in a footnote.",
    orderTitle: "Read in this order",
    orderIntro:
      "The order below is the one that matches how people actually arrive: with a connection that works and a VPN they want to build. If you are starting from a router that has no IPv6 at all, read the second entry first — it is what puts a real delegated prefix on the WAN, which the first one assumes you already have.",
    afterTitle: "Where this goes next",
    after1:
      "Above this sits the web server the router forwards to, which has its own series of decisions to make about who it admits and what it executes. Below it there is not much left: this is the edge. What remains is operational — a prefix that changes after a line event and takes your firewall rules out of alignment with reality, a VPN peer that silently stops rekeying, an address list that grows without bound because nothing ages entries out.",
    after2:
      "The honeypot article is also the natural bridge to the blocklist tooling used elsewhere on this site. The addresses it collects are the same class of traffic the web-server tarpit sees; running both means the same scanner gets refused at two layers, and the router layer is the one that costs nothing to enforce.",
    limitsTitle: "What this series does not cover",
    limits1:
      "There is no routing protocol here — no BGP, no OSPF, no multi-WAN failover. A single-homed residential line with one delegated prefix is a deliberately narrow scope, and it is the scope in which the dual-stack details are hard enough to be worth writing down. There is also no CAPsMAN or wireless chapter: the wireless side of a MikroTik deployment is a separate topic that shares almost none of the reasoning here.",
    notes: {
      p007: "The piece most readers come for, and the one that states the addressing assumptions the rest of the series exists to satisfy. WireGuard on RouterOS is quick to get working for IPv4 and then quietly incomplete: the tunnel comes up, traffic flows, and every IPv6 destination behind it is unreachable. The article configures both families end to end — interface addressing, allowed-IPs on each side, the firewall rules that let the tunnel talk to the LAN, and the DNS behavior that decides whether a client actually uses the v6 path it now has.",
      p008: "This is where the addresses come from. On DIGI's Spanish fibre the WAN is PPPoE inside a tagged VLAN, and IPv6 arrives as a delegated prefix over DHCPv6 rather than as a single address — which means the router has to request it, keep it, and hand subnets out of it, and the whole thing has to survive the prefix changing. The article covers the VLAN tagging, the PPPoE client, prefix delegation, SLAAC on the LAN side, and the firewall rules that a dual-stack WAN needs before it is safe to leave running.",
      p006: "With the link up and the tunnel working, the last decision is what to do about everything that scans it. The honeypot listens on ports nothing legitimate would touch, and a connection attempt is treated as sufficient evidence: the source lands in an address list, and the RAW table drops its traffic before connection tracking allocates anything for it. Read it last — it is the only one of the three that presumes a working, addressed router, and the only one whose effect you can watch accumulate in a list over the following days.",
    },
  },

  "kleidos-firmware": {
    title: "Kleidos firmware: three decisions under hard constraints",
    description:
      "Three deep dives from a hardware password manager on ESP32-S3: packed i18n strings, an encrypt-then-MAC vault, and device-bound key derivation.",
    lead: "Three engineering decisions from Kleidos, a hardware password manager built on an ESP32-S3. No operating system to delegate to, no network to phone home to, no filesystem permissions to hide behind, and a flash budget that makes every design choice cost something visible. Read together they show what security engineering looks like when the usual escape hatches are unavailable.",
    whyTitle: "Why these three belong together",
    why1: "Each article isolates one decision and follows it all the way to the measurement that justified it. That is deliberate: on a microcontroller almost every interesting choice is a trade against a fixed budget — flash bytes, RAM, milliseconds, entropy — and a decision defended in the abstract is usually a decision that was never actually paid for. The numbers in these articles are the ones from the build, including the ones that were worse than expected.",
    why2: "The device also makes the threat model unusually concrete. A hardware password manager is a thing an attacker can hold. That single fact removes most of the assumptions general security writing rests on: there is no trusted server to rate-limit an attacker, no account to lock, no operating system keychain to defer to, and no way to keep a secret merely by not writing it down, because the attacker can read the flash. Two of the three articles are direct consequences of that.",
    why3: "The third thread is that none of these decisions were made in isolation from the others. The compact string pool exists partly because the cryptographic work needed the flash it freed. The vault format's authentication step is what makes the key derivation's fail-closed behavior observable rather than theoretical. Reading them in order shows the budget moving from one subsystem to another, which is the part of embedded work that rarely survives into a write-up.",
    orderTitle: "Read in this order",
    orderIntro:
      "The order runs from the cheapest constraint to understand to the one with the sharpest consequences. Each entry states the decision it settles.",
    afterTitle: "Where this goes next",
    after1:
      "The obvious next questions are the ones about the boundary of the device rather than its inside: how firmware updates are authenticated, how the secure boot chain and flash encryption interact with the eFuse secret the third article depends on, and what an attacker with physical access and a laboratory can still recover. Those deserve their own articles rather than a paragraph here, because the honest answers involve limits, not solutions.",
    after2:
      "Kleidos itself is a private project and its repository is not public, so these articles carry the reasoning and the measurements rather than a link to clone. Everything described is reproducible from the article: the string-pool generator is a build-time script whose algorithm is spelled out, and the cryptographic constructions are standard primitives composed in a stated order, which is the part that matters and the part most often got wrong.",
    limitsTitle: "What this series does not cover",
    limits1:
      "There is no hardware chapter — no schematic, no enclosure, no supply-chain discussion — and no user-interface design. The scope is firmware decisions with a security or resource consequence, which is why a display driver and a button debounce routine, both of which took real work, appear nowhere. Nor is this a tutorial series: none of the three articles is a step-by-step build, and following them requires being comfortable with C++ on bare metal and with the vocabulary of applied cryptography.",
    notes: {
      p010: "Start with the flash budget, because it is the constraint that shapes everything after it. A device with a five-language interface stores a lot of short strings, and the naive representation — an array of pointers per language — spends a surprising fraction of its cost on the pointers rather than the text. The article walks through a build-time generator that packs every translation into a single blob addressed by 16-bit offsets, deduplicating the strings that are identical across languages, and reports what that actually saved. It is also the gentlest entry point: no cryptography, just a measurement and a generator.",
      p011: "Next, the file the device is for. A vault that decrypts before it authenticates will happily process an attacker's modifications, and on a microcontroller the consequences of parsing attacker-controlled plaintext are not abstract. The article covers encrypt-then-MAC, why the MAC is verified over the ciphertext before a single byte is decrypted, and how the read path is structured so that any failure — truncation, a flipped bit, a substituted file — ends in a refusal rather than a partial result. Fail-closed is a property of the code path, not of an intention, and this is the article that shows the difference.",
      p012: "Finally, the key that opens it. Users pick a four-digit PIN, and no iteration count saves a four-digit secret from an attacker who has the flash contents and a desktop machine: the entire keyspace is ten thousand candidates. The answer is to make the derivation impossible off-device by mixing in a secret that never leaves it — an eFuse-backed HMAC key the CPU can use but not read — and feeding it through HKDF alongside the PIN. The article explains why this is a device-binding argument rather than a strength argument, and is candid about what it does not protect against.",
    },
  },
};

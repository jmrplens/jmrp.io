"""Core analysis engine for WebMCP validation.

Performs HTTP-based analysis of WebMCP implementations:
1. Discovery — manifest existence, link tags, HTTP headers
2. Manifest validation — structure, tool definitions, naming
3. Per-page analysis — provider detection, tool registration data
4. Cross-referencing — manifest vs. actual page tools
5. Security — HTTPS, sensitive data checks
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from webmcp_analyzer.models import (
    AnalysisResult,
    Category,
    Check,
    PageInfo,
    Severity,
    ToolInfo,
)

# WebMCP spec constants
WELL_KNOWN_PATH = "/.well-known/webmcp.json"
LINK_REL = "webmcp-manifest"
VALID_ANNOTATION_KEYS = {"readOnlyHint"}
KEBAB_CASE_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
SENSITIVE_PATTERNS = re.compile(
    r"(api[_-]?key|secret|token|password|credential|auth)",
    re.IGNORECASE,
)
# More specific patterns that look for actual credential values
# (not just the word "password" in a tool description)
SENSITIVE_VALUE_PATTERNS = [
    re.compile(r'"(api[_-]?key|secret[_-]?key|access[_-]?token)"\s*:\s*"[^"]{8,}"', re.IGNORECASE),
    re.compile(r'"(password|secret|credential)"\s*:\s*"(?!.*\{)[^"]{8,}"', re.IGNORECASE),
    re.compile(r'(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9._-]{20,})', re.IGNORECASE),
]

# WebMCP patterns in JavaScript bundles
WEBMCP_JS_PATTERNS = re.compile(
    r"modelContext|registerTool|provideContext|clearContext|unregisterTool"
)

# CDN domains to skip when scanning external scripts
CDN_DOMAINS = frozenset({
    "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com",
    "cdn.skypack.dev", "esm.sh", "ajax.googleapis.com",
    "code.jquery.com", "cdn.bootcdn.net", "cdn.staticfile.org",
    "fonts.googleapis.com", "fonts.gstatic.com",
    "www.googletagmanager.com", "www.google-analytics.com",
    "cdn.cloudflare.com", "static.cloudflareinsights.com",
})

# Reasonable limits
MAX_CRAWL_PAGES = 30
MAX_JS_SIZE = 512 * 1024  # 512 KB per script file
MAX_SCRIPTS_PER_PAGE = 5
DEFAULT_TIMEOUT = 15


class WebMCPAnalyzer:
    """Analyzes a website's WebMCP implementation.

    Usage:
        analyzer = WebMCPAnalyzer("https://example.com", timeout=10)
        result = analyzer.run()
    """

    def __init__(
        self,
        url: str,
        *,
        pages: list[str] | None = None,
        crawl: bool = False,
        max_pages: int = MAX_CRAWL_PAGES,
        timeout: int = DEFAULT_TIMEOUT,
        verify_ssl: bool = True,
        verbose: bool = False,
        scan_js: bool = True,
    ) -> None:
        self.base_url = url.rstrip("/")
        parsed = urlparse(self.base_url)
        self.origin = f"{parsed.scheme}://{parsed.netloc}"
        initial = parsed.path.rstrip("/")
        self.initial_path = f"{initial}/" if initial else "/"
        self.extra_pages = pages or []
        self.crawl = crawl
        self.max_pages = max_pages
        self.timeout = timeout
        self.verify_ssl = verify_ssl
        self.verbose = verbose
        self.scan_js = scan_js

        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": "WebMCP-Analyzer/0.1.0 (+https://jmrp.io/tools/webmcp-tester/)",
                "Accept": "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        self._session.verify = verify_ssl

        self.result = AnalysisResult(target_url=self.base_url, origin=self.origin)

    # ── Public API ────────────────────────────────────────────────

    def run(self) -> AnalysisResult:
        """Execute the full analysis pipeline."""
        self._check_security_basics()
        manifest_data = self._check_discovery()
        if manifest_data:
            self._validate_manifest(manifest_data)
        self._analyze_pages()
        self._post_analysis_adjustments()
        if manifest_data and self.result.pages:
            self._cross_reference()
        return self.result

    # ── Phase 0: Security basics ──────────────────────────────────

    def _check_security_basics(self) -> None:
        """Check fundamental security requirements."""
        parsed = urlparse(self.base_url)

        if parsed.scheme == "https":
            self._add_check(
                "S001",
                Category.SECURITY,
                "Site uses HTTPS",
                Severity.PASS,
            )
        else:
            self._add_check(
                "S001",
                Category.SECURITY,
                "Site does not use HTTPS",
                Severity.WARNING,
                "WebMCP tools may handle sensitive data; HTTPS is strongly recommended.",
            )

    # ── Phase 1: Discovery ────────────────────────────────────────

    def _check_discovery(self) -> dict | None:
        """Check manifest discovery and fetch it."""
        # .well-known URIs are always at the domain root (RFC 8615)
        manifest_url = f"{self.origin}{WELL_KNOWN_PATH}"
        self.result.manifest_url = manifest_url

        # D001: Fetch manifest
        try:
            resp = self._session.get(manifest_url, timeout=self.timeout)
        except requests.RequestException as e:
            self._add_check(
                "D001",
                Category.DISCOVERY,
                "Manifest HTTP request failed",
                Severity.ERROR,
                str(e),
            )
            return None

        if resp.status_code == 200:
            self._add_check(
                "D001",
                Category.DISCOVERY,
                f"Manifest found at {WELL_KNOWN_PATH}",
                Severity.PASS,
                f"HTTP {resp.status_code}, {len(resp.content)} bytes",
            )
        else:
            self._add_check(
                "D001",
                Category.DISCOVERY,
                f"Manifest not found at {WELL_KNOWN_PATH}",
                Severity.ERROR,
                f"HTTP {resp.status_code}",
            )
            return None

        # D002: Content-Type
        content_type = resp.headers.get("Content-Type", "")
        if "application/json" in content_type:
            self._add_check(
                "D002",
                Category.DISCOVERY,
                "Manifest Content-Type is application/json",
                Severity.PASS,
            )
        else:
            self._add_check(
                "D002",
                Category.DISCOVERY,
                f"Manifest Content-Type is '{content_type}'",
                Severity.WARNING,
                "Expected application/json",
            )

        # D003: Parse JSON
        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            self._add_check(
                "D003",
                Category.DISCOVERY,
                "Manifest is not valid JSON",
                Severity.ERROR,
                str(e),
            )
            return None

        self._add_check(
            "D003",
            Category.DISCOVERY,
            "Manifest is valid JSON",
            Severity.PASS,
        )
        self.result.manifest_raw = data

        # D004: Cache headers
        cache_control = resp.headers.get("Cache-Control", "")
        if cache_control:
            self._add_check(
                "D004",
                Category.DISCOVERY,
                "Manifest has Cache-Control header",
                Severity.PASS,
                cache_control,
            )
        else:
            self._add_check(
                "D004",
                Category.DISCOVERY,
                "Manifest missing Cache-Control header",
                Severity.WARNING,
                "Consider adding caching for the static manifest file.",
            )

        # D005: Check root page for <link rel="webmcp-manifest">
        self._check_link_tag_in_page(self.base_url)

        return data

    def _check_link_tag_in_page(self, url: str) -> None:
        """Check if the page has a <link rel='webmcp-manifest'> tag."""
        try:
            resp = self._session.get(url, timeout=self.timeout)
            soup = BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException:
            self._add_check(
                "D005",
                Category.DISCOVERY,
                "Could not fetch page to check link tag",
                Severity.WARNING,
                url,
            )
            return

        link = soup.find("link", rel=LINK_REL)
        if link:
            href = link.get("href", "")
            self._add_check(
                "D005",
                Category.DISCOVERY,
                f'<link rel="{LINK_REL}"> found in HTML',
                Severity.PASS,
                f'href="{href}"',
            )
            # D006: Verify href points to a fetchable manifest
            if href:
                resolved = urljoin(url + "/", href)
                expected = f"{self.origin}{WELL_KNOWN_PATH}"
                if resolved.rstrip("/") == expected.rstrip("/"):
                    self._add_check(
                        "D006",
                        Category.DISCOVERY,
                        "Link href matches well-known manifest location",
                        Severity.PASS,
                    )
                else:
                    self._add_check(
                        "D006",
                        Category.DISCOVERY,
                        "Link href does not match well-known location",
                        Severity.WARNING,
                        f"Link points to {resolved}, expected {expected}",
                    )
        else:
            self._add_check(
                "D005",
                Category.DISCOVERY,
                f'No <link rel="{LINK_REL}"> found in HTML',
                Severity.ERROR,
                "Agents rely on this tag for manifest discovery.",
            )

    # ── Phase 2: Manifest validation ──────────────────────────────

    def _validate_manifest(self, data: dict) -> None:
        """Validate the manifest structure and tool definitions."""
        # M001: Has tools array
        tools_raw = data.get("tools")
        if not isinstance(tools_raw, list):
            self._add_check(
                "M001",
                Category.MANIFEST,
                'Manifest missing "tools" array',
                Severity.ERROR,
                f'Found type: {type(tools_raw).__name__}',
            )
            return

        self._add_check(
            "M001",
            Category.MANIFEST,
            f'Manifest has "tools" array ({len(tools_raw)} tools)',
            Severity.PASS,
        )

        # M002: Non-empty
        if len(tools_raw) == 0:
            self._add_check(
                "M002",
                Category.MANIFEST,
                "Tools array is empty",
                Severity.WARNING,
                "No tools defined in manifest.",
            )
        else:
            self._add_check(
                "M002",
                Category.MANIFEST,
                f"{len(tools_raw)} tools defined",
                Severity.PASS,
            )

        # Validate each tool
        names_seen: set[str] = set()
        all_names_valid = True
        all_have_name = True
        all_have_desc = True
        name_issues: list[str] = []

        for i, tool_raw in enumerate(tools_raw):
            tool_info = self._validate_tool(tool_raw, i)
            self.result.tools.append(tool_info)

            if not tool_info.name:
                all_have_name = False
            if not tool_info.description:
                all_have_desc = False

            # Check uniqueness
            if tool_info.name in names_seen:
                name_issues.append(f"Duplicate: {tool_info.name}")
                tool_info.issues.append("Duplicate tool name")
            names_seen.add(tool_info.name)

            # Check naming convention
            if tool_info.name and not KEBAB_CASE_RE.match(tool_info.name):
                all_names_valid = False

        # M003: All have name
        if all_have_name:
            self._add_check(
                "M003",
                Category.MANIFEST,
                "All tools have a name",
                Severity.PASS,
            )
        else:
            missing = sum(1 for t in self.result.tools if not t.name)
            self._add_check(
                "M003",
                Category.MANIFEST,
                f"{missing} tool(s) missing name",
                Severity.ERROR,
            )

        # M004: All have description
        if all_have_desc:
            self._add_check(
                "M004",
                Category.MANIFEST,
                "All tools have a description",
                Severity.PASS,
            )
        else:
            missing = sum(1 for t in self.result.tools if not t.description)
            self._add_check(
                "M004",
                Category.MANIFEST,
                f"{missing} tool(s) missing description",
                Severity.ERROR,
            )

        # M005: Unique names
        if not name_issues:
            self._add_check(
                "M005",
                Category.MANIFEST,
                "All tool names are unique",
                Severity.PASS,
            )
        else:
            self._add_check(
                "M005",
                Category.MANIFEST,
                "Duplicate tool names found",
                Severity.ERROR,
                "; ".join(name_issues),
            )

        # M006: Naming convention
        if all_names_valid:
            self._add_check(
                "M006",
                Category.MANIFEST,
                "All tool names follow kebab-case convention",
                Severity.PASS,
            )
        else:
            bad = [
                t.name
                for t in self.result.tools
                if t.name and not KEBAB_CASE_RE.match(t.name)
            ]
            self._add_check(
                "M006",
                Category.MANIFEST,
                f"{len(bad)} tool name(s) not in kebab-case",
                Severity.WARNING,
                ", ".join(bad[:5]) + ("..." if len(bad) > 5 else ""),
            )

        # M007: No unknown top-level keys
        known_keys = {"tools", "name", "description", "version"}
        extra = set(data.keys()) - known_keys
        if extra:
            self._add_check(
                "M007",
                Category.MANIFEST,
                f"Unknown top-level keys: {', '.join(extra)}",
                Severity.INFO,
                "These are not part of the WebMCP spec but won't cause issues.",
            )

        # Security check: no sensitive data in manifest
        # Check for value-like patterns (key=value, key: value) not just keywords
        # Tool descriptions legitimately mention terms like "password" or "auth"
        found_sensitive: list[str] = []
        manifest_str = json.dumps(data)
        for pattern in SENSITIVE_VALUE_PATTERNS:
            matches = pattern.findall(manifest_str)
            found_sensitive.extend(matches)

        if found_sensitive:
            self._add_check(
                "S002",
                Category.SECURITY,
                "Manifest may contain embedded credentials",
                Severity.WARNING,
                f"Patterns found: {', '.join(set(found_sensitive)[:5])}",
            )
        else:
            self._add_check(
                "S002",
                Category.SECURITY,
                "No embedded credentials detected in manifest",
                Severity.PASS,
            )

    def _validate_tool(self, raw: Any, index: int) -> ToolInfo:
        """Validate a single tool definition from the manifest."""
        if not isinstance(raw, dict):
            return ToolInfo(
                name=f"<invalid-{index}>",
                description="",
                issues=[f"Tool at index {index} is not an object (got {type(raw).__name__})"],
            )

        name = raw.get("name", "")
        description = raw.get("description", "")
        issues: list[str] = []

        # Name validation
        if not name:
            issues.append("Missing name")
        elif not isinstance(name, str):
            issues.append(f"Name is not a string: {type(name).__name__}")
            name = str(name)

        # Description validation
        if not description:
            issues.append("Missing description")
        elif not isinstance(description, str):
            issues.append(f"Description is not a string: {type(description).__name__}")
            description = str(description)
        elif len(description) < 10:
            issues.append(f"Description too short ({len(description)} chars)")
        elif len(description) > 500:
            issues.append(f"Description too long ({len(description)} chars)")

        # Input schema
        schema = raw.get("inputSchema", {})
        has_schema = bool(schema)
        param_count = 0
        required_params = 0

        if has_schema and isinstance(schema, dict):
            props = schema.get("properties", {})
            param_count = len(props) if isinstance(props, dict) else 0
            req = schema.get("required", [])
            required_params = len(req) if isinstance(req, list) else 0

            # Check schema has type: object
            if schema.get("type") != "object" and props:
                issues.append('inputSchema missing type: "object"')

            # Check required fields exist in properties
            if isinstance(req, list) and isinstance(props, dict):
                for r in req:
                    if r not in props:
                        issues.append(f'Required field "{r}" not in properties')

            # Check each property has a type
            if isinstance(props, dict):
                for prop_name, prop_def in props.items():
                    if isinstance(prop_def, dict) and "type" not in prop_def and "enum" not in prop_def:
                        issues.append(f'Property "{prop_name}" missing type')

        # Annotations
        annotations = raw.get("annotations", {})
        has_annotations = bool(annotations)
        read_only: bool | None = None

        if has_annotations and isinstance(annotations, dict):
            read_only = annotations.get("readOnlyHint")

            # Check for unknown annotation keys
            unknown = set(annotations.keys()) - VALID_ANNOTATION_KEYS
            if unknown:
                issues.append(f"Unknown annotation keys: {', '.join(unknown)}")

        tool = ToolInfo(
            name=name if isinstance(name, str) else str(name),
            description=description if isinstance(description, str) else str(description),
            has_input_schema=has_schema,
            param_count=param_count,
            required_params=required_params,
            has_annotations=has_annotations,
            read_only=read_only,
            issues=issues,
        )

        # Add per-tool check
        if issues:
            self._add_check(
                f"T-{name or index}",
                Category.TOOLS,
                f'Tool "{name or index}" has {len(issues)} issue(s)',
                Severity.WARNING,
                "; ".join(issues),
            )
        else:
            self._add_check(
                f"T-{name}",
                Category.TOOLS,
                f'Tool "{name}" is valid',
                Severity.PASS,
            )

        return tool

    # ── Phase 3: Page analysis ────────────────────────────────────

    def _analyze_pages(self) -> None:
        """Analyze one or more pages for WebMCP integration."""
        pages_to_check: list[str] = [self.initial_path]

        # Add user-specified pages
        for p in self.extra_pages:
            path = p if p.startswith("/") else f"/{p}"
            if path not in pages_to_check:
                pages_to_check.append(path)

        # Crawl sitemap if requested
        if self.crawl:
            sitemap_pages = self._get_sitemap_pages()
            for sp in sitemap_pages:
                if sp not in pages_to_check and len(pages_to_check) < self.max_pages:
                    pages_to_check.append(sp)

        for path in pages_to_check:
            page_info = self._analyze_single_page(path)
            self.result.pages.append(page_info)

    def _analyze_single_page(self, path: str) -> PageInfo:
        """Analyze a single page for WebMCP markers."""
        url = f"{self.origin}{path}"
        page = PageInfo(url=url, path=path)

        try:
            resp = self._session.get(url, timeout=self.timeout)
            page.status_code = resp.status_code
        except requests.RequestException as e:
            page.issues.append(f"Request failed: {e}")
            return page

        if resp.status_code != 200:
            page.issues.append(f"HTTP {resp.status_code}")
            return page

        soup = BeautifulSoup(resp.text, "html.parser")

        # Check for link tag
        link_tag = soup.find("link", rel=LINK_REL)
        page.has_link_tag = link_tag is not None
        if link_tag:
            page.manifest_href = link_tag.get("href", "")

        # Find provider script with data-webmcp-tools
        provider = soup.find(id="webmcp-provider")
        if not provider:
            # Also look by data attribute
            provider = soup.find(attrs={"data-webmcp-tools": True})

        if provider:
            page.has_provider = True
            tools_json = provider.get("data-webmcp-tools", "")
            if tools_json:
                try:
                    tools_data = json.loads(tools_json)
                    if isinstance(tools_data, list):
                        page.tool_count = len(tools_data)
                        page.tool_names = [
                            t.get("name", "") for t in tools_data if isinstance(t, dict)
                        ]
                except (json.JSONDecodeError, ValueError):
                    page.issues.append("Could not parse data-webmcp-tools JSON")

        # Count WebMCP script blocks with tool registration
        # Check for registerTool calls (reliable) and WebMCP START markers (source-only)
        scripts = soup.find_all("script")
        for script in scripts:
            text = script.get_text() or ""
            has_marker = "=== WebMCP START ===" in text
            has_register = "registerTool" in text and "modelContext" in text
            if has_marker or has_register:
                page.webmcp_script_blocks += 1

        # Scan external JS files for WebMCP patterns
        if self.scan_js:
            self._scan_external_scripts(soup, url, page)

        # Check for declarative <webmcp-tool> elements
        webmcp_elements = soup.find_all("webmcp-tool")
        page.declarative_tool_count = len(webmcp_elements)

        # Check for declarative form-based tools (toolname attribute on <form>)
        tool_forms = soup.find_all("form", attrs={"toolname": True})
        page.declarative_tool_count += len(tool_forms)

        # Add per-page check based on what was found
        has_any = (
            page.has_provider
            or page.js_webmcp_detected
            or page.declarative_tool_count > 0
            or page.webmcp_script_blocks > 0
        )

        if has_any:
            details_parts: list[str] = []
            if page.has_provider:
                details_parts.append(f"provider: {page.tool_count} tools")
            if page.webmcp_script_blocks:
                details_parts.append(f"script blocks: {page.webmcp_script_blocks}")
            if page.js_webmcp_detected:
                details_parts.append(f"JS bundles: {', '.join(page.js_webmcp_scripts)}")
            if page.declarative_tool_count:
                details_parts.append(f"declarative: {page.declarative_tool_count}")

            self._add_check(
                f"P-{path}",
                Category.PAGES,
                f"Page {path}: WebMCP implementation detected",
                Severity.PASS,
                "; ".join(details_parts),
            )
        else:
            # Not having WebMCP on every page isn't necessarily wrong
            self._add_check(
                f"P-{path}",
                Category.PAGES,
                f"Page {path}: no WebMCP integration detected",
                Severity.INFO,
                "This page may not have WebMCP tools registered.",
            )

        return page

    def _get_sitemap_pages(self) -> list[str]:
        """Extract page paths from sitemap.xml."""
        paths: list[str] = []
        sitemap_urls = [
            f"{self.origin}/sitemap-index.xml",
            f"{self.origin}/sitemap.xml",
        ]
        # Also check at base_url path if different from origin
        if self.origin != self.base_url:
            sitemap_urls.extend([
                f"{self.base_url}/sitemap-index.xml",
                f"{self.base_url}/sitemap.xml",
            ])

        for sitemap_url in sitemap_urls:
            try:
                resp = self._session.get(sitemap_url, timeout=self.timeout)
                if resp.status_code != 200:
                    continue
            except requests.RequestException:
                continue

            try:
                root = ET.fromstring(resp.text)
            except ET.ParseError:
                continue

            # Handle sitemap index (contains <sitemap><loc>)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            sitemap_locs = root.findall(".//sm:sitemap/sm:loc", ns)
            if sitemap_locs:
                for loc in sitemap_locs:
                    if loc.text:
                        paths.extend(self._fetch_sitemap_urls(loc.text))
                break

            # Direct sitemap (contains <url><loc>)
            url_locs = root.findall(".//sm:url/sm:loc", ns)
            for loc in url_locs:
                if loc.text:
                    parsed = urlparse(loc.text)
                    paths.append(parsed.path)
            break

        # Deduplicate and select a representative sample
        seen: set[str] = set()
        unique: list[str] = []
        for p in paths:
            if p not in seen:
                seen.add(p)
                unique.append(p)

        return self._select_representative_pages(unique)

    def _fetch_sitemap_urls(self, sitemap_url: str) -> list[str]:
        """Fetch URLs from a single sitemap file."""
        paths: list[str] = []
        try:
            resp = self._session.get(sitemap_url, timeout=self.timeout)
            if resp.status_code != 200:
                return paths
            root = ET.fromstring(resp.text)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            for loc in root.findall(".//sm:url/sm:loc", ns):
                if loc.text:
                    parsed = urlparse(loc.text)
                    paths.append(parsed.path)
        except (requests.RequestException, ET.ParseError):
            pass
        return paths

    def _select_representative_pages(self, paths: list[str]) -> list[str]:
        """Select a diverse subset of pages for analysis.

        Try to include one page from each major section (blog, tools, cv, etc.)
        plus a few individual tool/post pages.
        """
        sections: dict[str, list[str]] = {}
        for p in paths:
            # Get the first path segment as section
            parts = [x for x in p.split("/") if x]
            section = parts[0] if parts else "root"
            # Skip locale prefixes
            if section in ("en", "es") and len(parts) > 1:
                section = parts[1]
            sections.setdefault(section, []).append(p)

        selected: list[str] = []
        for section, section_paths in sections.items():
            # Add section index
            idx = next((p for p in section_paths if p.rstrip("/").count("/") <= 2), None)
            if idx and idx not in selected:
                selected.append(idx)
            # Add one deep page per section
            deep = next(
                (p for p in section_paths if p.rstrip("/").count("/") >= 2 and p not in selected),
                None,
            )
            if deep:
                selected.append(deep)

            if len(selected) >= self.max_pages:
                break

        return selected[: self.max_pages]

    # ── Phase 3b: External JS scanning ───────────────────────────

    def _scan_external_scripts(
        self, soup: BeautifulSoup, page_url: str, page: PageInfo
    ) -> None:
        """Scan external JS files for WebMCP API usage patterns.

        Fetches same-origin script bundles and looks for
        modelContext, registerTool, provideContext, etc.
        Skips CDN scripts and limits download size.
        """
        scripts = soup.find_all("script", src=True)
        candidates: list[str] = []

        for script in scripts:
            src = script.get("src", "")
            if not src:
                continue
            abs_url = urljoin(page_url, src)
            parsed = urlparse(abs_url)
            # Skip known CDN domains (they won't contain WebMCP code)
            if parsed.netloc in CDN_DOMAINS:
                continue
            candidates.append(abs_url)

        for js_url in candidates[:MAX_SCRIPTS_PER_PAGE]:
            try:
                resp = self._session.get(js_url, timeout=self.timeout)
                if resp.status_code != 200:
                    continue
                text = resp.text
                if len(text) > MAX_JS_SIZE:
                    text = text[:MAX_JS_SIZE]
                if WEBMCP_JS_PATTERNS.search(text):
                    page.js_webmcp_detected = True
                    filename = urlparse(js_url).path.rsplit("/", 1)[-1]
                    page.js_webmcp_scripts.append(filename or js_url)
            except requests.RequestException:
                continue

    # ── Phase 3c: Post-analysis adjustments ───────────────────────

    def _post_analysis_adjustments(self) -> None:
        """Adjust check severities based on overall implementation findings.

        When a JavaScript-only or declarative WebMCP implementation is
        detected (no manifest), soften manifest-related errors to warnings
        and add credit checks for the detected approach.
        """
        has_manifest = self.result.manifest_raw is not None
        has_js = any(p.js_webmcp_detected for p in self.result.pages)
        has_declarative = any(
            p.declarative_tool_count > 0 for p in self.result.pages
        )

        if not (has_js or has_declarative) or has_manifest:
            return

        # --- JS/declarative implementation without manifest ---
        # Soften D001 from ERROR → WARNING (missing manifest is less
        # critical when tools ARE registered via JS runtime)
        for check in self.result.checks:
            if check.id == "D001" and check.severity == Severity.ERROR:
                check.severity = Severity.WARNING
                check.details += (
                    " — JS-based implementation detected; "
                    "add manifest for static discoverability"
                )

        # Credit for JS detection
        if has_js:
            js_files: set[str] = set()
            for p in self.result.pages:
                js_files.update(p.js_webmcp_scripts)
            self._add_check(
                "D007",
                Category.DISCOVERY,
                f"WebMCP JS runtime detected ({len(js_files)} bundle(s))",
                Severity.PASS,
                f"Files: {', '.join(sorted(js_files)[:5])}",
            )

        # Credit for declarative elements
        if has_declarative:
            total = sum(
                p.declarative_tool_count for p in self.result.pages
            )
            self._add_check(
                "D008",
                Category.DISCOVERY,
                f"Declarative <webmcp-tool> elements found ({total})",
                Severity.PASS,
            )

        # Note in TOOLS category about static analysis limitation
        self._add_check(
            "T-JS",
            Category.TOOLS,
            "Tool definitions in JS bundles (not statically analyzable)",
            Severity.WARNING,
            "Add /.well-known/webmcp.json for full tool validation.",
        )

    # ── Phase 4: Cross-referencing ────────────────────────────────

    def _cross_reference(self) -> None:
        """Compare manifest tools with tools actually found on pages."""
        manifest_names = {t.name for t in self.result.tools}
        found_on_pages: set[str] = set()

        for page in self.result.pages:
            found_on_pages.update(page.tool_names)

        # Tools in manifest but never seen on any page
        # (This is normal — we can't crawl every page, and app tools
        # are only on their specific pages)
        manifest_only = manifest_names - found_on_pages
        if manifest_only and self.verbose:
            self._add_check(
                "X001",
                Category.PAGES,
                f"{len(manifest_only)} manifest tool(s) not seen on scanned pages",
                Severity.INFO,
                "These tools may be registered on pages not scanned. "
                f"Names: {', '.join(sorted(manifest_only)[:10])}",
            )

        # Tools seen on pages but not in manifest
        page_only = found_on_pages - manifest_names
        if page_only:
            self._add_check(
                "X002",
                Category.PAGES,
                f"{len(page_only)} tool(s) found on pages but not in manifest",
                Severity.WARNING,
                f"Names: {', '.join(sorted(page_only))}",
            )
        else:
            self._add_check(
                "X002",
                Category.PAGES,
                "All page tools are listed in the manifest",
                Severity.PASS,
            )

        # Coverage info
        total_manifest = len(manifest_names)
        total_found = len(found_on_pages & manifest_names)
        if total_manifest > 0:
            pct = round(total_found / total_manifest * 100)
            self._add_check(
                "X003",
                Category.PAGES,
                f"Tool coverage: {total_found}/{total_manifest} ({pct}%) seen across {len(self.result.pages)} page(s)",
                Severity.INFO,
                "Use --crawl to scan more pages for better coverage.",
            )

    # ── Helpers ────────────────────────────────────────────────────

    def _add_check(
        self,
        check_id: str,
        category: Category,
        description: str,
        severity: Severity,
        details: str = "",
    ) -> None:
        """Record a validation check."""
        self.result.checks.append(
            Check(
                id=check_id,
                category=category,
                description=description,
                severity=severity,
                details=details,
            )
        )

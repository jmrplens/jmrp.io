"""Data models for WebMCP analysis results."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Severity(Enum):
    """Check result severity levels."""

    PASS = "pass"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class Category(Enum):
    """Check categories for scoring."""

    DISCOVERY = "discovery"
    MANIFEST = "manifest"
    TOOLS = "tools"
    PAGES = "pages"
    SECURITY = "security"


# Points awarded per severity per check
SEVERITY_WEIGHT: dict[Severity, float] = {
    Severity.PASS: 1.0,
    Severity.INFO: 0.0,  # Informational — not scored
    Severity.WARNING: 0.5,
    Severity.ERROR: 0.0,
}

# Maximum score contribution per category (out of 100)
CATEGORY_MAX: dict[Category, int] = {
    Category.DISCOVERY: 25,
    Category.MANIFEST: 25,
    Category.TOOLS: 25,
    Category.PAGES: 15,
    Category.SECURITY: 10,
}


@dataclass
class Check:
    """A single validation check result."""

    id: str
    category: Category
    description: str
    severity: Severity
    details: str = ""

    @property
    def passed(self) -> bool:
        return self.severity == Severity.PASS

    @property
    def is_scored(self) -> bool:
        return self.severity != Severity.INFO


@dataclass
class ToolInfo:
    """Parsed tool definition from the manifest."""

    name: str
    description: str
    has_input_schema: bool = False
    param_count: int = 0
    required_params: int = 0
    has_annotations: bool = False
    read_only: bool | None = None
    issues: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return len(self.issues) == 0


@dataclass
class PageInfo:
    """Analysis results for a single page."""

    url: str
    path: str
    status_code: int = 0
    has_provider: bool = False
    has_link_tag: bool = False
    manifest_href: str = ""
    tool_count: int = 0
    tool_names: list[str] = field(default_factory=list)
    webmcp_script_blocks: int = 0
    js_webmcp_detected: bool = False
    js_webmcp_scripts: list[str] = field(default_factory=list)
    declarative_tool_count: int = 0
    issues: list[str] = field(default_factory=list)


@dataclass
class AnalysisResult:
    """Complete analysis result for a target URL."""

    target_url: str
    version: str = "0.1.0"
    checks: list[Check] = field(default_factory=list)
    tools: list[ToolInfo] = field(default_factory=list)
    pages: list[PageInfo] = field(default_factory=list)
    manifest_raw: dict | None = None
    manifest_url: str = ""
    origin: str = ""
    errors: list[str] = field(default_factory=list)

    @property
    def implementation_type(self) -> str:
        """Determine the WebMCP implementation approach."""
        has_manifest = self.manifest_raw is not None
        has_provider = any(p.has_provider for p in self.pages)
        has_js = any(p.js_webmcp_detected for p in self.pages)
        has_declarative = any(p.declarative_tool_count > 0 for p in self.pages)

        if not any([has_manifest, has_provider, has_js, has_declarative]):
            return "none"

        parts: list[str] = []
        if has_manifest:
            parts.append("manifest")
        if has_provider:
            parts.append("provider")
        if has_js:
            parts.append("js-runtime")
        if has_declarative:
            parts.append("declarative")

        return " + ".join(parts)

    @property
    def score(self) -> int:
        """Calculate weighted score (0-100)."""
        category_scores: dict[Category, tuple[float, float]] = {}
        for check in self.checks:
            if not check.is_scored:
                continue
            earned, total = category_scores.get(check.category, (0.0, 0.0))
            total += 1.0
            earned += SEVERITY_WEIGHT[check.severity]
            category_scores[check.category] = (earned, total)

        weighted_sum = 0.0
        for cat, (earned, total) in category_scores.items():
            if total == 0:
                continue
            ratio = earned / total
            weighted_sum += ratio * CATEGORY_MAX.get(cat, 0)

        return round(weighted_sum)

    @property
    def total_checks(self) -> int:
        return len([c for c in self.checks if c.is_scored])

    @property
    def passed_checks(self) -> int:
        return len([c for c in self.checks if c.passed])

    @property
    def warnings(self) -> int:
        return sum(1 for c in self.checks if c.severity == Severity.WARNING)

    @property
    def error_count(self) -> int:
        return sum(1 for c in self.checks if c.severity == Severity.ERROR)

    @property
    def info_count(self) -> int:
        return sum(1 for c in self.checks if c.severity == Severity.INFO)

    def category_score(self, category: Category) -> float:
        """Return score ratio (0.0–1.0) for a category."""
        scored = [c for c in self.checks if c.category == category and c.is_scored]
        if not scored:
            return 1.0
        passed = sum(1 for c in scored if c.passed)
        return passed / len(scored)

    def to_dict(self) -> dict:
        """Serialize to JSON-compatible dict."""
        return {
            "target_url": self.target_url,
            "version": self.version,
            "score": self.score,
            "summary": {
                "total_checks": self.total_checks,
                "passed": self.passed_checks,
                "warnings": self.warnings,
                "errors": self.error_count,
            },
            "checks": [
                {
                    "id": c.id,
                    "category": c.category.value,
                    "description": c.description,
                    "severity": c.severity.value,
                    "details": c.details,
                }
                for c in self.checks
            ],
            "tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "has_input_schema": t.has_input_schema,
                    "param_count": t.param_count,
                    "read_only": t.read_only,
                    "valid": t.valid,
                    "issues": t.issues,
                }
                for t in self.tools
            ],
            "pages": [
                {
                    "url": p.url,
                    "path": p.path,
                    "status_code": p.status_code,
                    "has_provider": p.has_provider,
                    "has_link_tag": p.has_link_tag,
                    "tool_count": p.tool_count,
                    "tool_names": p.tool_names,
                    "webmcp_script_blocks": p.webmcp_script_blocks,
                    "js_webmcp_detected": p.js_webmcp_detected,
                    "js_webmcp_scripts": p.js_webmcp_scripts,
                    "declarative_tool_count": p.declarative_tool_count,
                    "issues": p.issues,
                }
                for p in self.pages
            ],
            "manifest": self.manifest_raw,
            "implementation_type": self.implementation_type,
        }

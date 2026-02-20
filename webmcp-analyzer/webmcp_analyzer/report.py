"""Rich terminal report for WebMCP analysis results.

Generates beautiful CLI output using the Rich library,
including check tables, tool listings, page analysis,
and a final score summary.
"""

from __future__ import annotations

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from webmcp_analyzer.models import AnalysisResult, Category, Severity

# Severity visual markers
_ICON: dict[Severity, str] = {
    Severity.PASS: "[green]✓[/]",
    Severity.INFO: "[blue]ℹ[/]",
    Severity.WARNING: "[yellow]⚠[/]",
    Severity.ERROR: "[red]✗[/]",
}


def print_report(result: AnalysisResult, *, verbose: bool = False) -> None:
    """Print a full analysis report to the terminal."""
    console = Console()
    console.print()

    # ── Header ────────────────────────────────────────────────────
    impl_type = result.implementation_type
    impl_style = (
        "green" if "manifest" in impl_type
        else "yellow" if impl_type != "none"
        else "red"
    )
    console.print(
        Panel(
            f"[bold]WebMCP Analyzer[/] v0.2.0\n"
            f"Target: [cyan]{result.target_url}[/]\n"
            f"Implementation: [{impl_style}]{impl_type}[/]",
            border_style="bright_blue",
            padding=(0, 2),
        )
    )

    # ── Checks by category ────────────────────────────────────────
    for category in Category:
        checks = [c for c in result.checks if c.category == category]
        if not checks:
            continue

        scored = [c for c in checks if c.is_scored]
        cat_score = result.category_score(category)
        label = category.value.replace("_", " ").title()

        console.print(f"\n[bold]{label}[/]", style="underline")

        for check in checks:
            icon = _ICON[check.severity]
            line = f"  {icon} {check.description}"
            if check.details and (verbose or check.severity in (Severity.WARNING, Severity.ERROR)):
                line += f"  [dim]({check.details})[/]"
            console.print(line)

        if scored:
            passed = sum(1 for c in scored if c.passed)
            pct = round(cat_score * 100)
            bar = _score_bar(cat_score)
            console.print(f"  {bar} {passed}/{len(scored)} checks — {pct}%")

    # ── Tool table ────────────────────────────────────────────────
    if result.tools:
        console.print(f"\n[bold underline]Tool Definitions ({len(result.tools)} tools)[/]\n")
        table = Table(show_header=True, header_style="bold", padding=(0, 1))
        table.add_column("Name", style="cyan", max_width=32)
        table.add_column("Read-Only", justify="center", width=10)
        table.add_column("Params", justify="right", width=7)
        table.add_column("Schema", justify="center", width=7)
        table.add_column("Status", justify="center", width=8)

        for tool in result.tools:
            ro_str = (
                "[green]yes[/]" if tool.read_only is True
                else "[yellow]no[/]" if tool.read_only is False
                else "[dim]—[/]"
            )
            schema_str = "[green]✓[/]" if tool.has_input_schema else "[dim]—[/]"
            status = "[green]valid[/]" if tool.valid else "[yellow]issues[/]"

            table.add_row(
                tool.name,
                ro_str,
                str(tool.param_count),
                schema_str,
                status,
            )

        console.print(table)

        # Tool issues detail (verbose only)
        if verbose:
            tools_with_issues = [t for t in result.tools if t.issues]
            if tools_with_issues:
                console.print("\n[bold]Tool Issues:[/]")
                for t in tools_with_issues:
                    for issue in t.issues:
                        console.print(f"  [yellow]⚠[/] {t.name}: {issue}")

    # ── Page analysis ─────────────────────────────────────────────
    if result.pages:
        console.print(f"\n[bold underline]Page Analysis ({len(result.pages)} pages scanned)[/]\n")

        page_table = Table(show_header=True, header_style="bold", padding=(0, 1))
        page_table.add_column("Path", style="cyan", max_width=40)
        page_table.add_column("Status", justify="center", width=7)
        page_table.add_column("Provider", justify="center", width=9)
        page_table.add_column("Link", justify="center", width=6)
        page_table.add_column("Tools", justify="right", width=6)
        page_table.add_column("Blocks", justify="right", width=7)
        page_table.add_column("JS", justify="center", width=6)

        for page in result.pages:
            status = (
                f"[green]{page.status_code}[/]" if page.status_code == 200
                else f"[red]{page.status_code}[/]" if page.status_code
                else "[dim]—[/]"
            )
            provider = "[green]✓[/]" if page.has_provider else "[dim]—[/]"
            link = "[green]✓[/]" if page.has_link_tag else "[dim]—[/]"
            js_col = (
                f"[green]✓[/] ({len(page.js_webmcp_scripts)})"
                if page.js_webmcp_detected
                else "[dim]—[/]"
            )

            page_table.add_row(
                page.path,
                status,
                provider,
                link,
                str(page.tool_count),
                str(page.webmcp_script_blocks),
                js_col,
            )

        console.print(page_table)

    # ── Errors list ───────────────────────────────────────────────
    if result.errors:
        console.print("\n[bold red]Errors:[/]")
        for err in result.errors:
            console.print(f"  [red]✗[/] {err}")

    # ── Recommendations ───────────────────────────────────────────
    recommendations: list[str] = []
    impl = result.implementation_type
    if "js-runtime" in impl and "manifest" not in impl:
        recommendations.append(
            "Add [bold]/.well-known/webmcp.json[/] manifest for "
            "static discoverability by AI agents and crawlers."
        )
        recommendations.append(
            "Add [bold]<link rel=\"webmcp-manifest\">[/] to HTML <head> "
            "to help agents find the manifest."
        )
    if impl == "none":
        recommendations.append(
            "No WebMCP implementation detected. See "
            "[cyan]https://webmachinelearning.github.io/webmcp/[/] "
            "for the spec."
        )

    if recommendations:
        console.print("\n[bold underline]Recommendations[/]\n")
        for i, rec in enumerate(recommendations, 1):
            console.print(f"  {i}. {rec}")

    # ── Final score ───────────────────────────────────────────────
    console.print()
    score = result.score
    style = "green" if score >= 80 else "yellow" if score >= 50 else "red"

    score_text = Text(f" {score}/100 ", style=f"bold {style}")
    console.print(
        Panel(
            _wide_score_bar(score) + "\n\n"
            f"  [bold]Overall Score:[/] {score_text}   "
            f"[green]✓ {result.passed_checks}[/] passed  "
            f"[yellow]⚠ {result.warnings}[/] warnings  "
            f"[red]✗ {result.error_count}[/] errors  "
            f"[blue]ℹ {result.info_count}[/] info",
            title="[bold]Summary[/]",
            border_style=style,
            padding=(1, 2),
        )
    )
    console.print()


def _score_bar(ratio: float, width: int = 20) -> str:
    """Generate a compact progress bar from 0.0–1.0."""
    filled = round(ratio * width)
    empty = width - filled
    color = "green" if ratio >= 0.8 else "yellow" if ratio >= 0.5 else "red"
    return f"[{color}]{'█' * filled}[/][dim]{'░' * empty}[/]"


def _wide_score_bar(score: int, width: int = 40) -> str:
    """Generate a wide score bar for the final summary."""
    filled = round(score / 100 * width)
    empty = width - filled
    color = "green" if score >= 80 else "yellow" if score >= 50 else "red"
    return f"  [{color}]{'█' * filled}[/][dim]{'░' * empty}[/] "

"""Command-line interface for WebMCP Analyzer.

Usage examples:
    webmcp-analyzer https://jmrp.io
    webmcp-analyzer https://jmrp.io --crawl --verbose
    webmcp-analyzer https://jmrp.io --pages /blog/ /tools/ --json
"""

from __future__ import annotations

import argparse
import json
import sys

from webmcp_analyzer import __version__
from webmcp_analyzer.analyzer import WebMCPAnalyzer
from webmcp_analyzer.report import print_report


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        prog="webmcp-analyzer",
        description=(
            "Validate and analyze a website's WebMCP implementation. "
            "Checks manifest discovery, tool definitions, per-page "
            "integration, and spec compliance."
        ),
        epilog="Example: webmcp-analyzer https://jmrp.io --crawl --verbose",
    )

    parser.add_argument(
        "url",
        help="Target website URL to analyze (e.g. https://jmrp.io)",
    )

    parser.add_argument(
        "--pages",
        nargs="+",
        metavar="PATH",
        help="Specific page paths to analyze (e.g. /blog/ /tools/hash-calculator/)",
    )

    parser.add_argument(
        "--crawl",
        action="store_true",
        help="Crawl sitemap to discover and analyze multiple pages",
    )

    parser.add_argument(
        "--max-pages",
        type=int,
        default=30,
        metavar="N",
        help="Maximum number of pages to analyze when crawling (default: 30)",
    )

    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output results as JSON (for CI integration)",
    )

    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed information for all checks",
    )

    parser.add_argument(
        "--timeout",
        type=int,
        default=15,
        metavar="SECS",
        help="HTTP request timeout in seconds (default: 15)",
    )

    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip SSL certificate verification",
    )

    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    """Main entry point for the CLI."""
    parser = build_parser()
    args = parser.parse_args(argv)

    # Normalize URL
    url: str = args.url
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    analyzer = WebMCPAnalyzer(
        url,
        pages=args.pages,
        crawl=args.crawl,
        max_pages=args.max_pages,
        timeout=args.timeout,
        verify_ssl=not args.no_verify,
        verbose=args.verbose,
    )

    result = analyzer.run()

    if args.json_output:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        print_report(result, verbose=args.verbose)

    # Exit code: 0 if score >= 50, 1 otherwise
    return 0 if result.score >= 50 else 1


if __name__ == "__main__":
    sys.exit(main())

/**
 * generate-lychee-report.mjs
 *
 * Converts the Lychee markdown output into a premium-styled HTML report
 * for inclusion in the CI dashboard.
 */

import fs from "node:fs";

const MD_PATH = "lychee-report.md";
const HTML_PATH = "lychee-report.html";

if (!fs.existsSync(MD_PATH)) {
  console.error(
    "❌ REPORT MISSING: Lychee did not produce lychee-report.md. Check if lychee ran correctly.",
  );
  process.exit(1);
}

const mdContent = fs.readFileSync(MD_PATH, "utf-8");

// Basic Markdown to HTML conversion for Lychee's specific output
const escapeHtml = (str) => {
  if (!str) return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

let htmlRows = "";
const lines = mdContent.split("\n");

let currentFile = "";
for (const line of lines) {
  if (line.startsWith("## ")) {
    currentFile = line.replace("## ", "").trim();
  } else if (line.startsWith("* ")) {
    const parts = line.split("|");
    if (parts.length >= 2) {
      // Secure regex for [name](url)
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(parts[0]); // NOSONAR
      const linkName = linkMatch ? linkMatch[1] : parts[0].replace("* ", "");
      const linkUrl = linkMatch ? linkMatch[2] : null;
      // Join all segments after the first to preserve | in error messages
      const error = parts.slice(1).join("|").trim();

      const safeFile = escapeHtml(currentFile);
      const safeName = escapeHtml(linkName);
      const safeError = escapeHtml(error);

      const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];
      let safeLinkUrl = null;

      if (linkUrl) {
        // Reject protocol-relative URLs (//evil.com)
        if (linkUrl.startsWith("//")) {
          // Keep null
        } else if (linkUrl.includes(":")) {
          // Absolute URL - validate protocol
          const protocolMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(linkUrl);
          if (
            protocolMatch &&
            allowedProtocols.includes(protocolMatch[1] + ":")
          ) {
            safeLinkUrl = escapeHtml(linkUrl);
          }
        } else {
          // Relative path (no protocol)
          safeLinkUrl = escapeHtml(linkUrl);
        }
      }

      const linkHtml = safeLinkUrl
        ? `<a href="${safeLinkUrl}" target="_blank" rel="noopener noreferrer" class="broken-link">${safeName}</a>`
        : `<span class="broken-link">${safeName}</span>`;

      htmlRows += `
        <tr>
          <td><code class="file-path">${safeFile}</code></td>
          <td>${linkHtml}</td>
          <td><span class="error-badge">${safeError}</span></td>
        </tr>
      `;
    }
  }
}

const hasErrors = htmlRows !== "";
const statusClass = hasErrors ? "status-danger" : "status-success";
const statusText = hasErrors ? "Link Check Failed" : "All Links OK";

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Checker Report</title>
    <style>
        :root {
            --bg: #f8f9fa;
            --card-bg: #ffffff;
            --text: #1a1a1a;
            --text-muted: #666;
            --primary: #2563eb;
            --danger: #dc2626;
            --success: #16a34a;
            --border: #e5e7eb;
            --font: system-ui, -apple-system, sans-serif;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --text: #f8fafc;
                --text-muted: #94a3b8;
                --border: #334155;
                --bg-danger: #7f1d1d;
                --text-danger: #fca5a5;
                --bg-success: #14532d;
                --text-success: #86efac;
            }
        }

        body {
            font-family: var(--font);
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
        }

        .container { max-width: 1000px; margin: 0 auto; }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--border);
        }

        .status-badge {
            padding: 0.5rem 1rem;
            border-radius: 9999px;
            font-weight: 700;
            font-size: 0.875rem;
            text-transform: uppercase;
        }

        .status-danger {
            background: var(--bg-danger, #fee2e2);
            color: var(--text-danger, #991b1b);
        }
        .status-success {
            background: var(--bg-success, #dcfce7);
            color: var(--text-success, #166534);
        }

        .report-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background: rgba(0,0,0,0.05);
            padding: 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border);
        }

        td {
            padding: 1rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.875rem;
        }

        .file-path {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            background: rgba(0,0,0,0.05);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-size: 0.75rem;
        }

        .broken-link {
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
        }

        .broken-link:hover { text-decoration: underline; }

        .error-badge {
            color: var(--danger);
            font-weight: 600;
        }

        .empty-state {
            padding: 4rem;
            text-align: center;
            color: var(--text-muted);
        }

        .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 style="margin:0">🔗 Link Checker Report</h1>
                <p style="margin:0.5rem 0 0; color:var(--text-muted)">Scan results for broken internal and external links</p>
            </div>
            <div class="status-badge ${statusClass}">${statusText}</div>
        </div>

        <div class="report-card">
            ${
              hasErrors
                ? `
                <table>
                    <thead>
                        <tr>
                            <th>File Location</th>
                            <th>Target URL</th>
                            <th>Error Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${htmlRows}
                    </tbody>
                </table>
            `
                : `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <h2>No Broken Links Found</h2>
                    <p>All links in the production build are functional!</p>
                </div>
            `
            }
        </div>
        
        <footer style="margin-top: 2rem; text-align: center; color: var(--text-muted); font-size: 0.875rem;">
            Generated on ${new Date().toLocaleString("en-US", {
              timeZone: "UTC",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
        </footer>
    </div>
</body>
</html>
`;

fs.writeFileSync(HTML_PATH, html, "utf-8");
console.log(`✅ Lychee HTML report generated at ${HTML_PATH}`);

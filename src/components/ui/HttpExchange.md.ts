import { markdownFor } from "@utils/llms/mdx/types";

/** One header line. */
interface Header {
  name?: string;
  value?: string;
}

/** One answer to the request. */
interface HttpResponse {
  label?: string;
  status?: number;
  statusText?: string;
  headers?: Header[];
  body?: string;
  note?: string;
}

const REASONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
};

/**
 * An HTTP exchange is already a text format, so the twin writes it as one: the
 * request as an `http` block, then each answer as its own block under its
 * label, with the note as a sentence after it. The status line is the claim the
 * figure makes, so it is kept verbatim; the pill colours and the tone icon are
 * presentation and are dropped (the label and the note carry the verdict).
 */
export default markdownFor({
  tag: "HttpExchange",
  toMarkdown(node, ctx) {
    const method = ctx.attr(node, "method");
    const path = ctx.attr(node, "path");
    const responses = ctx.expr<HttpResponse[]>(node, "responses");
    if (!method || !path || !Array.isArray(responses)) return ctx.body(node);

    /**
     * Renders header lines.
     *
     * @param headers - The headers, if any.
     * @returns One `Name: value` line per header.
     */
    const headerLines = (headers: Header[] | undefined): string[] =>
      (headers ?? []).map((h) => `${h?.name ?? ""}: ${h?.value ?? ""}`);

    const request = [
      `${method} ${path}`,
      ...headerLines(ctx.expr<Header[]>(node, "requestHeaders")),
    ];
    const requestBody = ctx.attr(node, "requestBody");
    if (requestBody) request.push("", requestBody);

    const parts: string[] = [];
    const title = ctx.attr(node, "title");
    if (title) parts.push(`**${title}**`);
    parts.push(["```http", ...request, "```"].join("\n"));

    for (const response of responses) {
      const status = response?.status ?? 0;
      const reason = response?.statusText ?? REASONS[status] ?? "";
      const lines = [
        `HTTP/1.1 ${status} ${reason}`.trimEnd(),
        ...headerLines(response?.headers),
      ];
      if (response?.body) lines.push("", response.body);
      const label = response?.label ? `${response.label}:\n\n` : "";
      const note = response?.note ? `\n\n${response.note}` : "";
      parts.push(`${label}${["```http", ...lines, "```"].join("\n")}${note}`);
    }

    const caption = ctx.attr(node, "caption");
    if (caption) parts.push(caption);
    return parts.join("\n\n");
  },
});

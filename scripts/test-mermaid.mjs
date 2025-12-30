import { renderMermaid } from "mermaid-isomorphic";

async function test() {
  console.log("Testing Mermaid Render...");
  try {
    const results = await renderMermaid(["graph TD; A-->B;"], {
      mermaidConfig: { theme: "neutral" },
    });
    console.log("Success!");
    console.log("SVG Length:", results[0].svg.length);
    console.log("Snippet:", results[0].svg.substring(0, 100));
  } catch (e) {
    console.error("Error:", e);
  }
}

test();

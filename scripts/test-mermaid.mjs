/**
 * Mermaid Rendering Test
 *
 * A utility script to verify the 'mermaid-isomorphic' renderer.
 * It attempts to render a sequence diagram to SVG to ensure the headless
 * browser (Puppeteer) and Mermaid configuration are working correctly.
 */

import { createMermaidRenderer } from "mermaid-isomorphic";

/**
 * Executes the Mermaid rendering test.
 * Initializes the renderer, defines a sample diagram, and attempts to render it.
 *
 * @returns {Promise<void>} Resolves when the test is complete.
 */
async function test() {
  console.log("Testing Mermaid Render with v3 API...");
  const mermaidRenderer = createMermaidRenderer({
    launchOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  const codes = [
    `sequenceDiagram
    participant C as Client
    participant N as Nginx
    
    C->>N: Client Hello
    N->>C: Request Cert
    C->>N: Client Cert`,
  ];

  try {
    console.log(
      "Calling mermaidRenderer with codes array:",
      JSON.stringify(codes),
    );
    const results = await mermaidRenderer(codes, {
      mermaidConfig: { theme: "neutral" },
    });

    console.log("Results received. Count:", results.length);
    for (const [i, res] of results.entries()) {
      if (res.status === "fulfilled") {
        console.log(
          `Result ${i}: Success (SVG length: ${res.value.svg.length})`,
        );
      } else {
        console.log(`Result ${i}: Failed - ${res.reason}`);
      }
    }
  } catch (error) {
    console.error("Caught error:", error);
  } finally {
    // Explicitly close the renderer to free up resources
    if (mermaidRenderer.close) {
      await mermaidRenderer.close();
    }
  }
}

try {
  await test();
} catch (error) {
  console.error("Test failed:", error);
  process.exit(1);
}

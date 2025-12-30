import { createMermaidRenderer } from "mermaid-isomorphic";
import fs from "node:fs";

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
    results.forEach((res, i) => {
      if (res.status === "fulfilled") {
        console.log(
          `Result ${i}: Success (SVG length: ${res.value.svg.length})`,
        );
      } else {
        console.log(`Result ${i}: Failed - ${res.reason}`);
      }
    });
  } catch (e) {
    console.error("Caught error:", e);
  } finally {
    // Explicitly try to close if it has a close method
    if (mermaidRenderer.close) {
      await mermaidRenderer.close();
    }
  }
}

test();

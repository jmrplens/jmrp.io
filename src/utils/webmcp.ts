/**
 * WebMCP Utility Functions
 *
 * Safe wrappers around the `navigator.modelContext` API with
 * feature detection and graceful fallbacks. All functions are
 * no-ops when the browser does not support WebMCP.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @module
 */

import type { WebMCPContextOptions, WebMCPTool } from "@src/types/webmcp";

/**
 * Checks whether the current browser supports the WebMCP API.
 *
 * @returns `true` if `navigator.modelContext` is available
 */
export function isWebMCPSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "modelContext" in navigator &&
    navigator.modelContext !== undefined
  );
}

/**
 * Registers a set of tools with the browser via `provideContext()`.
 * Clears any pre-existing tools before registering the new ones.
 * No-op if WebMCP is not supported.
 *
 * @param options - Context options containing the tools array
 */
export function provideContext(options: WebMCPContextOptions): void {
  if (!isWebMCPSupported()) return;
  try {
    navigator.modelContext!.provideContext(options);
  } catch (error) {
    console.warn("[WebMCP] Failed to provide context:", error);
  }
}

/**
 * Registers a single tool without clearing the existing set.
 * No-op if WebMCP is not supported.
 * Logs a warning if the tool name already exists or schema is invalid.
 *
 * @param tool - The tool definition to register
 */
export function registerTool(tool: WebMCPTool): void {
  if (!isWebMCPSupported()) return;
  try {
    navigator.modelContext!.registerTool(tool);
  } catch (error) {
    console.warn(`[WebMCP] Failed to register tool "${tool.name}":`, error);
  }
}

/**
 * Removes a tool by name from the registered set.
 * No-op if WebMCP is not supported.
 *
 * @param name - The unique name of the tool to remove
 */
export function unregisterTool(name: string): void {
  if (!isWebMCPSupported()) return;
  try {
    navigator.modelContext!.unregisterTool(name);
  } catch (error) {
    console.warn(`[WebMCP] Failed to unregister tool "${name}":`, error);
  }
}

/**
 * Unregisters all tools from the browser.
 * No-op if WebMCP is not supported.
 */
export function clearContext(): void {
  if (!isWebMCPSupported()) return;
  try {
    navigator.modelContext!.clearContext();
  } catch (error) {
    console.warn("[WebMCP] Failed to clear context:", error);
  }
}

/**
 * Convenience function to register multiple tools at once via `provideContext`.
 * Replaces all previously registered tools.
 * No-op if WebMCP is not supported.
 *
 * @param tools - Array of tool definitions to register
 */
export function registerTools(tools: WebMCPTool[]): void {
  provideContext({ tools });
}

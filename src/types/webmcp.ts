/**
 * WebMCP Type Definitions
 *
 * TypeScript interfaces for the WebMCP API proposal.
 * Based on the W3C Web Machine Learning CG specification draft.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @see https://github.com/webmachinelearning/webmcp
 *
 * These types define the shape of the `navigator.modelContext` API
 * that allows web pages to expose JavaScript functions as "tools"
 * invocable by AI agents, browser assistants, and assistive technologies.
 */

// ─── Tool Annotations ────────────────────────────────────────────────

/**
 * Optional metadata about a tool's behavior.
 * Helps agents make decisions about when it is safe to call the tool.
 */
export interface WebMCPToolAnnotations {
  /**
   * If true, indicates the tool does not modify any state and only reads data.
   * Agents may use this hint to determine safe parallel execution.
   */
  readOnlyHint?: boolean;
}

// ─── Client Interface ────────────────────────────────────────────────

/**
 * Represents an AI agent executing a tool provided by the site.
 * The lifetime of this interface is scoped to the execution of a tool.
 * Passed as the second parameter to a tool's `execute` callback.
 */
export interface WebMCPClient {
  /**
   * Asynchronously requests user input during the execution of a tool.
   * The callback is invoked to perform user interaction (e.g., confirmation dialog).
   * Can be called multiple times during a single tool execution.
   *
   * @param callback - Function that performs the user interaction
   * @returns Promise resolving with the result of the callback
   */
  requestUserInteraction: (
    callback: () => Promise<unknown>,
  ) => Promise<unknown>;
}

// ─── Tool Execute Callback ───────────────────────────────────────────

/**
 * Callback function invoked when an agent calls a tool.
 *
 * @param input - The input parameters matching the tool's inputSchema
 * @param client - The ModelContextClient for requesting user interaction
 * @returns A promise or value with the tool's result (typically MCP content format)
 */
export type WebMCPToolExecuteCallback = (
  input: Record<string, unknown>,
  client: WebMCPClient,
) => unknown;

// ─── Tool Definition ─────────────────────────────────────────────────

/**
 * Describes a tool that can be invoked by agents.
 * Each tool has a unique name, natural language description,
 * a JSON Schema for input validation, and an execute callback.
 */
export interface WebMCPTool {
  /**
   * Unique identifier for the tool.
   * Used by agents to reference the tool when making calls.
   */
  name: string;

  /**
   * Natural language description of the tool's functionality.
   * Helps agents understand when and how to use the tool.
   * Should be in English for maximum LLM compatibility.
   */
  description: string;

  /**
   * JSON Schema object describing expected input parameters.
   * Follows the JSON Schema specification (draft-07 or later).
   *
   * @see https://json-schema.org/
   */
  inputSchema?: Record<string, unknown>;

  /**
   * Callback invoked when an agent calls the tool.
   * Receives the validated input and a client object for user interaction.
   */
  execute: WebMCPToolExecuteCallback;

  /**
   * Optional annotations providing metadata about tool behavior.
   */
  annotations?: WebMCPToolAnnotations;
}

// ─── Context Options ─────────────────────────────────────────────────

/**
 * Options passed to `navigator.modelContext.provideContext()`.
 * Contains the list of tools to register with the browser.
 */
export interface WebMCPContextOptions {
  /**
   * List of tools to register. Each tool name must be unique.
   * Calling provideContext() clears any pre-existing tools first.
   */
  tools?: WebMCPTool[];
}

// ─── ModelContext Interface ──────────────────────────────────────────

/**
 * The ModelContext interface as exposed on `navigator.modelContext`.
 * Provides methods to register and manage tools for AI agents.
 */
export interface WebMCPModelContext {
  /**
   * Registers tools with the browser, clearing any pre-existing ones.
   * Useful for SPAs that change available tools based on UI state.
   */
  provideContext: (options?: WebMCPContextOptions) => void;

  /** Unregisters all tools from the browser. */
  clearContext: () => void;

  /**
   * Registers a single tool without clearing existing ones.
   * Throws if a tool with the same name already exists or if inputSchema is invalid.
   */
  registerTool: (tool: WebMCPTool) => void;

  /** Removes the tool with the specified name from the registered set. */
  unregisterTool: (name: string) => void;
}

// ─── Navigator Extension ─────────────────────────────────────────────

/**
 * Augments the global Navigator interface with the `modelContext` property.
 * This declaration makes `navigator.modelContext` available in TypeScript
 * without errors, while still requiring feature detection at runtime.
 */
declare global {
  interface Navigator {
    /** WebMCP ModelContext API — may be undefined if browser does not support it. */
    modelContext?: WebMCPModelContext;
  }
}

// ─── Serializable Tool (for manifest) ────────────────────────────────

/**
 * A tool definition without the execute callback, suitable for
 * serialization into a static manifest file (webmcp.json).
 */
export interface WebMCPToolManifestEntry {
  /** Unique tool identifier */
  name: string;

  /** Natural language description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;

  /** Optional behavioral annotations */
  annotations?: WebMCPToolAnnotations;

  /** URL path where this tool is available (e.g., "/tools/hash-calculator/") */
  availableOn?: string | string[];
}

/**
 * Structure for the static WebMCP manifest file.
 * Allows agents to discover tools without navigating to the page.
 */
export interface WebMCPManifest {
  /** Manifest format version */
  version: string;

  /** Human-readable site name */
  name: string;

  /** Site description */
  description: string;

  /** Canonical site URL */
  url: string;

  /** All tools available across the site */
  tools: WebMCPToolManifestEntry[];
}

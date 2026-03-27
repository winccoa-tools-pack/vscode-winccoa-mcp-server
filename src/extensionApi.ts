/**
 * Public API contract for the WinCC OA MCP Server extension.
 *
 * Other VS Code extensions (e.g. vscode-winccoa-database) can consume this
 * API via `vscode.extensions.getExtension(...).activate()`.
 */

import * as vscode from 'vscode';

export interface McpConnectionInfo {
    /** Full MCP endpoint URL, e.g. "http://localhost:3001/mcp" */
    url: string;
    /** Authentication token */
    token: string;
    /** Authentication type */
    authType: 'bearer' | 'basic';
    /** WinCC OA project name (if detected) */
    projectName?: string;
    /** WinCC OA project directory path (if detected) */
    projectPath?: string;
}

export type McpConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface McpServerExtensionApi {
    /** Get current MCP connection info, or null if not connected */
    getConnectionInfo(): McpConnectionInfo | null;

    /** Get current connection state */
    getConnectionState(): McpConnectionState;

    /** Event fired when connection state or config changes */
    onDidChangeConnection: vscode.Event<McpConnectionInfo | null>;
}

/**
 * MCP Client for WinCC OA MCP Server
 *
 * Core client for communicating with WinCC OA MCP Server via HTTP/SSE.
 * Based on working test scripts (test-connection.mjs, test-tool.mjs).
 */

import { ExtensionOutputChannel } from './extensionOutput';

export interface McpClientConfig {
    /** MCP Server URL (e.g., 'http://localhost:3001/mcp') */
    url: string;
    /** Authentication token */
    token: string;
    /** Authentication type (default: 'bearer') */
    authType?: 'bearer' | 'basic';
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: any;
}

export interface McpResource {
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
}

export interface McpToolResult {
    content?: Array<{
        type: string;
        text?: string;
        [key: string]: any;
    }>;
    isError?: boolean;
}

/**
 * Core MCP Client for WinCC OA
 */
export class McpClient {
    private config: Required<McpClientConfig>;
    private requestId = 0;

    constructor(config: McpClientConfig) {
        this.config = {
            url: config.url,
            token: config.token,
            authType: config.authType || 'bearer',
            timeout: config.timeout || 30000,
        };
    }

    /**
     * Initialize MCP session
     */
    async initialize(): Promise<{ protocolVersion: string; serverInfo: any; capabilities: any }> {
        const response = await this.sendRequest({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'vscode-winccoa-mcp-client',
                    version: '0.1.0',
                },
            },
            id: this.getNextId(),
        });

        return response.result;
    }

    /**
     * List available tools
     */
    async listTools(): Promise<McpTool[]> {
        const response = await this.sendRequest({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: this.getNextId(),
        });

        return response.result?.tools || [];
    }

    /**
     * List available resources
     */
    async listResources(): Promise<McpResource[]> {
        const response = await this.sendRequest({
            jsonrpc: '2.0',
            method: 'resources/list',
            params: {},
            id: this.getNextId(),
        });

        return response.result?.resources || [];
    }

    /**
     * Call a specific MCP tool
     */
    async callTool(toolName: string, args: Record<string, any> = {}): Promise<McpToolResult> {
        const response = await this.sendRequest({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args,
            },
            id: this.getNextId(),
        });

        return response.result;
    }

    /**
     * Read a resource
     */
    async readResource(
        uri: string,
    ): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
        const response = await this.sendRequest({
            jsonrpc: '2.0',
            method: 'resources/read',
            params: {
                uri,
            },
            id: this.getNextId(),
        });

        return response.result;
    }

    /**
     * Send MCP request via HTTP/SSE
     *
     * CRITICAL: MCP Server returns Server-Sent Events (SSE) format:
     * - Lines starting with "event: " define event type
     * - Lines starting with "data: " contain JSON payload
     * - Empty line terminates event
     */
    private async sendRequest(request: any): Promise<any> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        ExtensionOutputChannel.debug(`[MCP] >>> Request: ${request.method}`);
        ExtensionOutputChannel.debug(
            `[MCP] >>> Params: ${JSON.stringify(request.params, null, 2)}`,
        );

        try {
            const response = await fetch(this.config.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                    Authorization: `${this.config.authType === 'bearer' ? 'Bearer' : 'Basic'} ${
                        this.config.token
                    }`,
                },
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            ExtensionOutputChannel.debug(
                `[MCP] <<< HTTP Status: ${response.status} ${response.statusText}`,
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Parse SSE response
            const text = await response.text();
            ExtensionOutputChannel.debug(`[MCP] <<< Raw SSE Response:\n${text}`);

            const result = this.parseSSEResponse(text);
            ExtensionOutputChannel.debug(
                `[MCP] <<< Parsed Result: ${JSON.stringify(result, null, 2).substring(0, 500)}...`,
            );

            return result;
        } catch (error: any) {
            ExtensionOutputChannel.error(`[MCP] !!! Error: ${error.message}`);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.config.timeout}ms`);
            }
            throw error;
        }
    }

    /**
     * Parse Server-Sent Events (SSE) response
     *
     * Format:
     * ```
     * event: message
     * data: {"jsonrpc":"2.0","id":1,"result":{...}}
     *
     * ```
     */
    private parseSSEResponse(text: string): any {
        const lines = text.split('\n');
        ExtensionOutputChannel.debug(`[MCP] Parsing SSE response (${lines.length} lines)`);

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonData = line.substring(6); // Remove 'data: ' prefix
                ExtensionOutputChannel.debug(
                    `[MCP] Found data line: ${jsonData.substring(0, 200)}...`,
                );
                try {
                    const parsed = JSON.parse(jsonData);

                    // Check for JSONRPC error
                    if (parsed.error) {
                        ExtensionOutputChannel.error(
                            `[MCP] JSONRPC Error: ${JSON.stringify(parsed.error)}`,
                        );
                        throw new Error(
                            `MCP Error: ${parsed.error.message || JSON.stringify(parsed.error)}`,
                        );
                    }

                    return parsed;
                } catch (error: any) {
                    // Re-throw if it's our custom error
                    if (error.message.startsWith('MCP Error:')) {
                        throw error;
                    }
                    ExtensionOutputChannel.error(`[MCP] JSON parse failed: ${error.message}`);
                    throw new Error(`Failed to parse SSE JSON: ${jsonData}`);
                }
            }
        }

        ExtensionOutputChannel.error(`[MCP] No valid SSE data found. Lines: ${lines.join(' | ')}`);
        throw new Error('No valid SSE data found in response');
    }

    /**
     * Get next request ID
     */
    private getNextId(): number {
        return ++this.requestId;
    }

    /**
     * Test connection to MCP Server
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.initialize();
            return true;
        } catch {
            return false;
        }
    }
}

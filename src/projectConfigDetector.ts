/**
 * Project Config Detector
 *
 * Auto-detects MCP Server configuration from WinCC OA project.
 * Integrates with Project Admin Extension to get active project.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionOutputChannel } from './extensionOutput';

export interface McpConfig {
    url: string;
    token: string;
    authType: 'bearer' | 'basic'; // McpClient only supports bearer/basic
    projectPath?: string;
    projectName?: string;
    /** WinCC OA project ID/name (used for PMON commands) */
    projectId?: string;
    /** WinCC OA version string, e.g. '3.21' (used to locate pmon binary) */
    winCCOAVersion?: string;
}

export type DetectionError =
    | 'project-admin-missing'
    | 'no-project-selected'
    | 'mcp-not-installed'
    | 'env-file-missing'
    | 'token-missing';

export class ProjectConfigDetector {
    private cachedConfig: McpConfig | null = null;
    private lastProjectPath: string | null = null;

    /**
     * Detect MCP configuration from active WinCC OA project
     */
    async detectConfig(): Promise<{ config: McpConfig | null; error?: DetectionError }> {
        try {
            // Step 1: Get active project from Project Admin Extension
            const project = await this.getActiveProject();
            if (!project) {
                return { config: null, error: 'no-project-selected' };
            }

            ExtensionOutputChannel.info(`Detecting MCP config for project: ${project.name}`);

            // Step 2: Check cache (avoid re-reading .env)
            if (project.path === this.lastProjectPath && this.cachedConfig) {
                ExtensionOutputChannel.debug('Using cached MCP config');
                return { config: this.cachedConfig };
            }

            // Step 3: Parse .env file
            const envConfig = await this.parseEnvFile(project.path);
            if (!envConfig) {
                return { config: null, error: 'mcp-not-installed' };
            }

            // Step 4: Build MCP config
            const config: McpConfig = {
                url: `http://localhost:${envConfig.port}/mcp`,
                token: envConfig.token,
                authType: envConfig.authType === 'bearer' ? 'bearer' : 'bearer', // Default to bearer
                projectPath: project.path,
                projectName: project.name,
                projectId: project.id,
                winCCOAVersion: project.version,
            };

            // Update cache
            this.cachedConfig = config;
            this.lastProjectPath = project.path;

            ExtensionOutputChannel.info(`✅ MCP config detected: ${config.url}`);
            return { config };
        } catch (error: any) {
            ExtensionOutputChannel.error(`Config detection failed: ${error.message}`);
            return { config: null, error: 'project-admin-missing' };
        }
    }

    /**
     * Invalidate cache (e.g., on project switch)
     */
    invalidateCache(): void {
        this.cachedConfig = null;
        this.lastProjectPath = null;
        ExtensionOutputChannel.debug('MCP config cache invalidated');
    }

    /**
     * Get active WinCC OA project from Project Admin Extension
     */
    private async getActiveProject(): Promise<{ name: string; path: string; id: string; version: string } | null> {
        const projectAdmin = vscode.extensions.getExtension('RichardJanisch.winccoa-project-admin');

        if (!projectAdmin) {
            ExtensionOutputChannel.warn('Project Admin Extension not found');
            return null;
        }

        if (!projectAdmin.isActive) {
            ExtensionOutputChannel.debug('Activating Project Admin Extension...');
            await projectAdmin.activate();
        }

        // Get API (assuming Project Admin exports API)
        const api = projectAdmin.exports;
        if (!api || !api.getCurrentProject) {
            ExtensionOutputChannel.warn('Project Admin Extension API not available');
            return null;
        }

        const project = api.getCurrentProject();
        if (!project) {
            ExtensionOutputChannel.debug('No WinCC OA project selected');
            return null;
        }

        return {
            name: project.name,
            path: project.projectDir, // Project Admin API returns projectDir, not path
            id: project.id,
            version: project.version ?? '',
        };
    }

    /**
     * Parse .env file from WinCC OA project
     */
    private async parseEnvFile(projectPath: string): Promise<{
        token: string;
        port: string;
        authType: string;
    } | null> {
        const envPath = path.join(projectPath, 'javascript', 'mcpServer', '.env');

        if (!fs.existsSync(envPath)) {
            ExtensionOutputChannel.warn(`MCP .env file not found: ${envPath}`);
            return null;
        }

        try {
            const envContent = await fs.promises.readFile(envPath, 'utf8');

            // Parse .env file
            const tokenMatch = envContent.match(/^MCP_API_TOKEN=(.*)$/m);
            const portMatch = envContent.match(/^MCP_HTTP_PORT=(.*)$/m);
            const authTypeMatch = envContent.match(/^MCP_AUTH_TYPE=(.*)$/m);

            if (!tokenMatch || !tokenMatch[1]) {
                ExtensionOutputChannel.error('MCP_API_TOKEN not found in .env');
                return null;
            }

            const config = {
                token: tokenMatch[1].trim(),
                port: portMatch ? portMatch[1].trim() : '3001',
                authType: authTypeMatch ? authTypeMatch[1].trim() : 'bearer',
            };

            ExtensionOutputChannel.debug(
                `Parsed .env: port=${config.port}, authType=${config.authType}`,
            );
            return config;
        } catch (error: any) {
            ExtensionOutputChannel.error(`Failed to read .env file: ${error.message}`);
            return null;
        }
    }
}

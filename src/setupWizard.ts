/**
 * MCP Server Setup Wizard
 * 
 * Automatically installs MCP Server if not present in project
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { ExtensionOutputChannel } from './extensionOutput';
import { ManagerInstallationHelper } from './managerInstallationHelper';

export class SetupWizard {
    private static readonly MCP_SUBPATH = 'javascript/mcpServer';

    /**
     * Check if MCP Server is installed in project
     */
    static async isMcpServerInstalled(projectDir: string): Promise<boolean> {
        const mcpPath = path.join(projectDir, this.MCP_SUBPATH);
        try {
            await fs.access(mcpPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Reset MCP Server (delete folder) and reinstall
     */
    static async resetAndReinstall(
        projectDir: string,
        projectName: string,
        projectId: string = '',
        winCCOAVersion: string = ''
    ): Promise<boolean> {
        ExtensionOutputChannel.info(`Resetting MCP Server for project: ${projectName}`);

        const mcpPath = path.join(projectDir, this.MCP_SUBPATH);

        try {
            // Step 1: Check if MCP Server exists
            const isInstalled = await this.isMcpServerInstalled(projectDir);
            if (!isInstalled) {
                ExtensionOutputChannel.info('MCP Server not installed - running setup instead');
                return await this.runSetup(projectDir, projectName);
            }

            // Step 2: Delete MCP Server folder and reinstall
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Resetting MCP Server for ${projectName}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Deleting MCP Server folder...' });

                try {
                    await fs.rm(mcpPath, { recursive: true, force: true });
                    ExtensionOutputChannel.info(`Deleted folder: ${mcpPath}`);
                } catch (error: any) {
                    ExtensionOutputChannel.warn(`Could not delete folder (may not exist): ${error.message}`);
                }

                progress.report({ increment: 20, message: 'Downloading from GitHub releases...' });
                await this.installFromGithubRelease(projectDir);

                progress.report({ increment: 85, message: 'Generating security token...' });
                const token = this.generateToken();

                progress.report({ increment: 95, message: 'Creating configuration...' });
                await this.createEnvFile(projectDir, token);

                progress.report({ increment: 100, message: 'Reset complete!' });
            });

            ExtensionOutputChannel.info('✅ MCP Server reset and reinstalled successfully');

            // Check and add manager (add if missing, skip if already present)
            const mcpServerPath = path.join(projectDir, this.MCP_SUBPATH);
            ExtensionOutputChannel.info('Checking MCP Server manager...');
            await ManagerInstallationHelper.addManagerAutomatically(
                projectDir, mcpServerPath, projectId, winCCOAVersion
            );

            return true;

        } catch (error: any) {
            ExtensionOutputChannel.error(`Reset failed: ${error.message}`);
            vscode.window.showErrorMessage(`MCP Server reset failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Run auto-setup wizard
     */
    static async runSetup(
        projectDir: string,
        projectName: string,
        projectId: string = '',
        winCCOAVersion: string = ''
    ): Promise<boolean> {
        ExtensionOutputChannel.info(`Starting MCP Server setup for project: ${projectName}`);

        // Ask user for confirmation
        const answer = await vscode.window.showInformationMessage(
            `MCP Server not found in project "${projectName}". Install now?`,
            { modal: true },
            'Install',
            'Skip'
        );

        if (answer !== 'Install') {
            ExtensionOutputChannel.info('Setup cancelled by user');
            return false;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing MCP Server for ${projectName}`,
                cancellable: false
            }, async (progress) => {
                // Step 1: Download and install from latest GitHub release
                progress.report({ increment: 0, message: 'Downloading from GitHub releases...' });
                await this.installFromGithubRelease(projectDir);

                // Step 2: Generate Token
                progress.report({ increment: 80, message: 'Generating security token...' });
                const token = this.generateToken();

                // Step 3: Create .env File
                progress.report({ increment: 90, message: 'Creating configuration...' });
                await this.createEnvFile(projectDir, token);

                progress.report({ increment: 100, message: 'Installation complete!' });
            });

            // Automatically add manager (runtime via PMON if running, else config/progs)
            const mcpServerPath = path.join(projectDir, this.MCP_SUBPATH);
            await ManagerInstallationHelper.addManagerAutomatically(
                projectDir, mcpServerPath, projectId, winCCOAVersion
            );

            ExtensionOutputChannel.info('✅ MCP Server setup completed successfully');
            return true;

        } catch (error: any) {
            ExtensionOutputChannel.error(`Setup failed: ${error.message}`);
            vscode.window.showErrorMessage(`MCP Server installation failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Install MCP Server from latest GitHub release asset (.tgz)
     */
    private static async installFromGithubRelease(projectDir: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('winccoa.mcp');
        const githubRepo = config.get<string>('githubRepo', 'winccoa-tools-pack/winccoa-mcp-server');

        const mcpServerDir = path.join(projectDir, this.MCP_SUBPATH);
        const tempFile = path.join(projectDir, 'javascript', `.mcp-release-${Date.now()}.tar.gz`);

        ExtensionOutputChannel.info(`Fetching latest release from: ${githubRepo}`);

        try {
            // Step 1: Get latest release info from GitHub API
            const releaseInfo = await this.fetchJson(
                `https://api.github.com/repos/${githubRepo}/releases/latest`
            );
            const tagName: string = releaseInfo.tag_name;
            const assets: Array<{ name: string; browser_download_url: string }> = releaseInfo.assets ?? [];

            const tarGzAsset = assets.find(a => a.name.endsWith('.tar.gz'));
            if (!tarGzAsset) {
                throw new Error(`No .tar.gz release asset found in release ${tagName} of ${githubRepo}`);
            }

            ExtensionOutputChannel.info(`Found release: ${tagName}, downloading: ${tarGzAsset.name}`);

            // Step 2: Download tar.gz to a temp file
            await fs.mkdir(path.dirname(tempFile), { recursive: true });
            await this.downloadFile(tarGzAsset.browser_download_url, tempFile);
            ExtensionOutputChannel.info(`Downloaded ${tarGzAsset.name}`);

            // Step 3: Extract to a temporary directory, then rename to mcpServer
            const tempExtractDir = path.join(projectDir, 'javascript', `.mcp-extract-${Date.now()}`);
            await fs.mkdir(tempExtractDir, { recursive: true });
            const extractResult = await this.executeCommand(
                'tar',
                ['-xzf', tempFile, '-C', tempExtractDir],
                projectDir
            );
            if (extractResult.exitCode !== 0) {
                await fs.rm(tempExtractDir, { recursive: true, force: true });
                throw new Error(`Extraction failed: ${extractResult.stderr}`);
            }

            // Detect whether the archive had a subdirectory prefix
            const entries = await fs.readdir(tempExtractDir, { withFileTypes: true });
            const subdirs = entries.filter(e => e.isDirectory());
            const files = entries.filter(e => !e.isDirectory());
            const sourceDir = (files.length === 0 && subdirs.length === 1)
                ? path.join(tempExtractDir, subdirs[0].name)
                : tempExtractDir;

            if (files.length === 0 && subdirs.length === 1) {
                ExtensionOutputChannel.info(`Artifact directory: ${subdirs[0].name}`);
            }

            // Remove existing mcpServer (if any) and rename extracted dir to mcpServer
            await fs.rm(mcpServerDir, { recursive: true, force: true });
            await fs.rename(sourceDir, mcpServerDir);

            // Clean up temp dir if it still exists (when sourceDir was a subdirectory)
            if (sourceDir !== tempExtractDir) {
                await fs.rm(tempExtractDir, { recursive: true, force: true });
            }
            ExtensionOutputChannel.info(`Installed to: ${mcpServerDir}`);

            ExtensionOutputChannel.info(`✅ MCP Server ${tagName} installed from GitHub release`);

        } finally {
            try {
                await fs.rm(tempFile, { force: true });
            } catch {}
        }
    }

    /**
     * Fetch JSON from a URL (HTTPS only)
     */
    private static fetchJson(url: string): Promise<any> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const https = require('https');
        const parsed = new URL(url);

        return new Promise((resolve, reject) => {
            https.get(
                {
                    hostname: parsed.hostname,
                    path: parsed.pathname + parsed.search,
                    headers: {
                        'User-Agent': 'vscode-winccoa-mcp-server',
                        'Accept': 'application/vnd.github+json'
                    }
                },
                (response: any) => {
                    let data = '';
                    response.on('data', (chunk: Buffer) => { data += chunk; });
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error(`Failed to parse GitHub API response: ${e}`));
                        }
                    });
                }
            ).on('error', reject);
        });
    }

    /**
     * Download a file from a URL to a local path, following redirects
     */
    private static downloadFile(url: string, destPath: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const https = require('https');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const http = require('http');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fsSync = require('fs');

        return new Promise((resolve, reject) => {
            const download = (downloadUrl: string) => {
                const protocol = downloadUrl.startsWith('https') ? https : http;
                protocol.get(downloadUrl, (response: any) => {
                    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
                        download(response.headers.location);
                        return;
                    }
                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${downloadUrl}`));
                        return;
                    }
                    const fileStream = fsSync.createWriteStream(destPath);
                    response.pipe(fileStream);
                    fileStream.on('finish', () => { fileStream.close(); resolve(); });
                    fileStream.on('error', reject);
                }).on('error', reject);
            };
            download(url);
        });
    }


    /**
     * Generate secure random token
     */
    private static generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create .env configuration file from .env.example, injecting a generated token
     */
    private static async createEnvFile(projectDir: string, token: string): Promise<void> {
        const envPath = path.join(projectDir, this.MCP_SUBPATH, '.env');
        const envExamplePath = path.join(projectDir, this.MCP_SUBPATH, '.env.example');

        let envContent: string;

        try {
            const example = await fs.readFile(envExamplePath, 'utf8');
            envContent = example.replace(/^MCP_API_TOKEN=.*$/m, `MCP_API_TOKEN=${token}`);
            ExtensionOutputChannel.info('Created .env from .env.example');
        } catch {
            ExtensionOutputChannel.warn('.env.example not found, using fallback template');
            envContent = [
                '# WinCC OA MCP Server Configuration',
                '# Auto-generated by WinCC OA MCP Server Extension',
                '',
                `MCP_API_TOKEN=${token}`,
                'MCP_MODE=http',
                'MCP_HTTP_PORT=3000',
                'MCP_HTTP_HOST=0.0.0.0',
                'MCP_AUTH_TYPE=bearer',
                'RATE_LIMIT_ENABLED=true',
                'MCP_CORS_ENABLED=true',
                'MCP_CORS_ORIGINS=*',
                'WINCCOA_FIELD=default',
                'TOOLS=datapoints/dp_basic,datapoints/dp_types,archive/archive_query,common/common_query,pv_range/pv_range_query,manager/manager_list',
                ''
            ].join('\n');
        }

        await fs.mkdir(path.dirname(envPath), { recursive: true });
        await fs.writeFile(envPath, envContent, 'utf8');
        ExtensionOutputChannel.info(`Configuration file created: ${envPath}`);
    }

    /**
     * Execute shell command
     */
    private static async executeCommand(
        command: string,
        args: string[],
        cwd: string
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const proc = spawn(command, args, { cwd, shell: true });

            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
                ExtensionOutputChannel.debug(data.toString().trim());
            });

            proc.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
                ExtensionOutputChannel.debug(data.toString().trim());
            });

            proc.on('close', (code: number) => {
                resolve({ exitCode: code, stdout, stderr });
            });

            proc.on('error', (error: Error) => {
                reject(error);
            });
        });
    }
}

/**
 * WinCC OA MCP Server Extension
 * 
 * VS Code extension for managing WinCC OA MCP Server.
 * Provides auto-detection, setup wizard, and GitHub Copilot integration.
 */

import * as vscode from 'vscode';
import { McpClient } from './mcpClient';
import { ExtensionOutputChannel } from './extensionOutput';
import { StatusBarManager } from './statusBar';
import { LanguageModelTools } from './languageModelTools';
import { ProjectConfigDetector, McpConfig } from './projectConfigDetector';
import { SetupWizard } from './setupWizard';
import { ConnectionMonitor } from './connectionMonitor';
import { McpConnectionInfo, McpServerExtensionApi } from './extensionApi';

// Global persistent client
let mcpClient: McpClient | null = null;
let currentConfig: McpConfig | null = null;

// Connection Monitor
let connectionMonitor: ConnectionMonitor | null = null;

// Extension API event emitter
const connectionChangeEmitter = new vscode.EventEmitter<McpConnectionInfo | null>();

let statusBar: StatusBarManager;
let languageModelTools: LanguageModelTools;
let configDetector: ProjectConfigDetector;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<McpServerExtensionApi> {
    ExtensionOutputChannel.info('WinCC OA MCP Server Extension activating...');

    // Initialize Config Detector
    configDetector = new ProjectConfigDetector();

    // Initialize Status Bar
    statusBar = new StatusBarManager();
    context.subscriptions.push(statusBar);

    // Initialize Language Model Tools (always register, even without client)
    languageModelTools = new LanguageModelTools(null);
    languageModelTools.register(context);

    // Auto-connect to MCP server on startup
    try {
        ExtensionOutputChannel.info('Auto-detecting MCP configuration...');
        const { config, error } = await configDetector.detectConfig();
        
        if (!config) {
            // Check if auto-setup should run
            await handleDetectionError(error);
            statusBar.setStatus('error');
        } else {
            ExtensionOutputChannel.info(`Connecting to MCP Server: ${config.url}`);
            await createClient(config);
            statusBar.setStatus('connected');
            ExtensionOutputChannel.info(`✅ Connected to ${config.projectName || 'WinCC OA'} MCP Server`);
        }
    } catch (error: any) {
        ExtensionOutputChannel.error(`Auto-connect failed: ${error.message}`);
        statusBar.setStatus('error');
        vscode.window.showWarningMessage(
            'WinCC OA MCP Server not reachable. Click status bar to retry.',
            'Show Logs'
        ).then(selection => {
            if (selection === 'Show Logs') {
                ExtensionOutputChannel.show();
            }
        });
    }

    // Subscribe to Project Admin project changes
    await subscribeToProjectChanges(context);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('winccoa.mcp.showMenu', showMenu),
        vscode.commands.registerCommand('winccoa.mcp.connect', connect),
        vscode.commands.registerCommand('winccoa.mcp.disconnect', disconnect),
        vscode.commands.registerCommand('winccoa.mcp.reconnect', reconnect),
        vscode.commands.registerCommand('winccoa.mcp.showInfo', showServerInfo),
        vscode.commands.registerCommand('winccoa.mcp.showOutput', () => ExtensionOutputChannel.show()),
        vscode.commands.registerCommand('winccoa.mcp.executeScript', executeScript),
        vscode.commands.registerCommand('winccoa.mcp.runSetup', runSetup),
        vscode.commands.registerCommand('winccoa.mcp.resetAndReinstall', resetAndReinstall)
    );

    // Watch .env file for changes (port, token, host edits)
    const envWatcher = vscode.workspace.createFileSystemWatcher('**/javascript/mcpServer/.env');
    envWatcher.onDidChange(async () => {
        ExtensionOutputChannel.info('.env file changed — re-detecting MCP config...');
        configDetector.invalidateCache();
        const { config } = await configDetector.detectConfig();
        if (config) {
            await createClient(config);
            statusBar.setStatus('connected');
            ExtensionOutputChannel.info(`✅ Reconnected with updated .env: ${config.url}`);
        }
    });
    context.subscriptions.push(envWatcher, connectionChangeEmitter);

    // Build and return the public extension API
    const api: McpServerExtensionApi = {
        getConnectionInfo: () => buildConnectionInfo(),
        getConnectionState: () => {
            if (mcpClient && currentConfig) { return 'connected'; }
            return 'disconnected';
        },
        onDidChangeConnection: connectionChangeEmitter.event,
    };

    ExtensionOutputChannel.info('WinCC OA MCP Server Extension activated ✅');
    return api;
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
    ExtensionOutputChannel.info('WinCC OA MCP Server Extension deactivating...');
    
    // Stop connection monitor
    if (connectionMonitor) {
        connectionMonitor.stop();
    }
    
    await disposeClient();
    ExtensionOutputChannel.info('WinCC OA MCP Server Extension deactivated');
}

/**
 * Build connection info from current config for the public API
 */
function buildConnectionInfo(): McpConnectionInfo | null {
    if (!currentConfig) { return null; }
    return {
        url: currentConfig.url,
        token: currentConfig.token,
        authType: currentConfig.authType,
        projectName: currentConfig.projectName,
        projectPath: currentConfig.projectPath,
    };
}

/**
 * Create and initialize MCP Client (persistent)
 */
async function createClient(config: McpConfig): Promise<McpClient> {
    ExtensionOutputChannel.info(`Creating MCP client for: ${config.url}`);

    // Dispose old client first
    await disposeClient();

    // Create new client
    const client = new McpClient(config);
    await client.initialize();

    // Store globally
    mcpClient = client;
    currentConfig = config;

    // Update all components
    languageModelTools.updateClient(client);

    // Start connection monitoring
    startConnectionMonitor();

    // Notify consumers of new connection
    connectionChangeEmitter.fire(buildConnectionInfo());

    ExtensionOutputChannel.info('✅ MCP Client created and initialized');
    return client;
}

/**
 * Dispose current MCP Client
 */
async function disposeClient(): Promise<void> {
    if (!mcpClient) {
        return;
    }
    
    ExtensionOutputChannel.info('Disposing MCP client...');
    
    // Stop connection monitor
    if (connectionMonitor) {
        connectionMonitor.stop();
        connectionMonitor = null;
    }
    
    try {
        // Client might have dispose/close method in future
        mcpClient = null;
        currentConfig = null;

        // Update components
        languageModelTools.updateClient(null);

        // Notify consumers of disconnection
        connectionChangeEmitter.fire(null);

        ExtensionOutputChannel.info('MCP client disposed');
    } catch (error: any) {
        ExtensionOutputChannel.error(`Error disposing client: ${error.message}`);
    }
}

/**
 * Get current MCP Client (if connected)
 */
function getClient(): McpClient | null {
    return mcpClient;
}

/**
 * Start Connection Monitor for current client
 */
function startConnectionMonitor(): void {
    if (!mcpClient) {
        ExtensionOutputChannel.warn('Connection Monitor: Cannot start - no client');
        return;
    }

    // Stop existing monitor
    if (connectionMonitor) {
        connectionMonitor.stop();
    }

    // Get settings from VS Code configuration
    const config = vscode.workspace.getConfiguration('winccoa.mcp');
    const heartbeatInterval = config.get<number>('heartbeatInterval', 30000);
    const reconnectRetries = config.get<number>('reconnectRetries', 3);
    const autoReconnect = config.get<boolean>('autoReconnect', true);

    ExtensionOutputChannel.debug(
        `Connection Monitor Config: interval=${heartbeatInterval}ms, ` +
        `retries=${reconnectRetries}, autoReconnect=${autoReconnect}`
    );

    // Create new monitor with user settings
    connectionMonitor = new ConnectionMonitor(
        {
            heartbeatInterval,
            reconnectRetries,
            autoReconnect
        },
        getClient,
        handleConnectionLost,
        handleReconnectSuccess,
        handleReconnectFailed
    );

    connectionMonitor.start();
}

/**
 * Handle connection lost event
 */
async function handleConnectionLost(): Promise<void> {
    ExtensionOutputChannel.warn('⚠️ Connection lost to MCP Server');
    statusBar.setStatus('error', 'Connection lost');
    connectionChangeEmitter.fire(null);
}

/**
 * Handle successful reconnect
 */
function handleReconnectSuccess(): void {
    ExtensionOutputChannel.info('✅ Auto-reconnect successful');
    statusBar.setStatus('connected');
    connectionChangeEmitter.fire(buildConnectionInfo());

    const config = vscode.workspace.getConfiguration('winccoa.mcp');
    const showNotifications = config.get<boolean>('showNotifications', true);
    
    if (showNotifications) {
        vscode.window.showInformationMessage(
            'MCP Server connection restored automatically'
        );
    }
}

/**
 * Handle failed reconnect
 */
function handleReconnectFailed(): void {
    ExtensionOutputChannel.error('❌ Auto-reconnect failed after maximum retries');
    statusBar.setStatus('error', 'Reconnect failed');
    
    const config = vscode.workspace.getConfiguration('winccoa.mcp');
    const showNotifications = config.get<boolean>('showNotifications', true);
    
    if (showNotifications) {
        vscode.window.showErrorMessage(
            'MCP Server connection lost. Click to reconnect.',
            'Reconnect',
            'Show Logs'
        ).then(selection => {
            if (selection === 'Reconnect') {
                vscode.commands.executeCommand('winccoa.mcp.reconnect');
            } else if (selection === 'Show Logs') {
                ExtensionOutputChannel.show();
            }
        });
    }
}

/**
 * Show Status Bar Quick Pick Menu
 */
async function showMenu(): Promise<void> {
    const isConnected = mcpClient !== null;
    const status = statusBar.getCurrentStatus();
    
    // Build context-sensitive menu items
    const items: vscode.QuickPickItem[] = [];
    
    if (isConnected) {
        items.push(
            {
                label: '$(info) Show Server Info',
                description: 'Display server details',
                detail: 'Shows server version and available tools'
            },
            {
                label: '$(debug-disconnect) Disconnect',
                description: 'Disconnect from MCP Server',
                detail: 'Stop MCP Server connection'
            },
            {
                label: '$(sync) Reconnect',
                description: 'Reconnect to MCP Server',
                detail: 'Force reconnection'
            }
        );
    } else {
        items.push(
            {
                label: '$(plug) Connect',
                description: 'Connect to MCP Server',
                detail: 'Establish connection to MCP Server'
            },
            {
                label: '$(tools) Run Setup',
                description: 'Install MCP Server',
                detail: 'Setup MCP Server in WinCC OA project'
            }
        );
    }
    
    // Always show logs
    items.push({
        label: '$(output) Show Logs',
        description: 'Open extension output',
        detail: 'View debug logs and messages'
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `MCP Server Actions (${isConnected ? 'Connected' : 'Disconnected'})`,
        title: 'WinCC OA MCP Server'
    });

    if (!selected) {
        return;
    }

    // Execute command based on selection
    if (selected.label.includes('Connect')) {
        await vscode.commands.executeCommand('winccoa.mcp.connect');
    } else if (selected.label.includes('Disconnect')) {
        await vscode.commands.executeCommand('winccoa.mcp.disconnect');
    } else if (selected.label.includes('Reconnect')) {
        await vscode.commands.executeCommand('winccoa.mcp.reconnect');
    } else if (selected.label.includes('Server Info')) {
        await vscode.commands.executeCommand('winccoa.mcp.showInfo');
    } else if (selected.label.includes('Run Setup')) {
        await vscode.commands.executeCommand('winccoa.mcp.runSetup');
    } else if (selected.label.includes('Show Logs')) {
        ExtensionOutputChannel.show();
    }
}

/**
 * Show Server Info (Version, Tools, etc.)
 */
async function showServerInfo(): Promise<void> {
    try {
        statusBar.setStatus('connecting', 'Fetching server info...');

        const client = getClient();
        if (!client || !currentConfig) {
            vscode.window.showWarningMessage('Not connected to MCP Server');
            statusBar.setStatus('error', 'No connection');
            return;
        }

        const config = currentConfig;
        
        const initResult = await client.initialize();
        const tools = await client.listTools();
        const resources = await client.listResources();

        statusBar.setStatus('connected');
        statusBar.setConnectionInfo(initResult.serverInfo.name, tools.length);

        // Build QuickPick items
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(server) Server Information',
                kind: vscode.QuickPickItemKind.Separator
            },
            {
                label: '$(project) Project',
                description: config.projectName || 'Unknown',
                detail: `WinCC OA Project`
            },
            {
                label: '$(server-process) Server',
                description: `${initResult.serverInfo.name} ${initResult.serverInfo.version}`,
                detail: `MCP Server Implementation`
            },
            {
                label: '$(plug) Protocol',
                description: initResult.protocolVersion,
                detail: `Model Context Protocol Version`
            },
            {
                label: '$(globe) URL',
                description: config.url,
                detail: `MCP Server Endpoint`
            },
            {
                label: '$(tools) Available Tools',
                kind: vscode.QuickPickItemKind.Separator
            },
            ...tools.map(t => ({
                label: `$(symbol-method) ${t.name}`,
                description: t.description?.split('\n')[0] || '',
                detail: t.description?.split('\n').slice(1).join(' ') || 'No description'
            })),
            {
                label: '$(folder) Available Resources',
                kind: vscode.QuickPickItemKind.Separator
            },
            ...resources.map(r => ({
                label: `$(file) ${r.name || r.uri}`,
                description: r.uri,
                detail: r.description || r.mimeType || 'No description'
            }))
        ];

        // Show QuickPick (non-interactive, just for display)
        await vscode.window.showQuickPick(items, {
            title: `$(wand) WinCC OA MCP Server - ${config.projectName || 'Unknown'}`,
            placeHolder: `${tools.length} tools, ${resources.length} resources available`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        ExtensionOutputChannel.info('Server info retrieved successfully');

    } catch (error: any) {
        statusBar.setStatus('error', 'Connection failed');
        ExtensionOutputChannel.error(`showServerInfo error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to get server info: ${error.message}`);
    }
}

/**
 * Subscribe to Project Admin project changes
 */
async function subscribeToProjectChanges(context: vscode.ExtensionContext): Promise<void> {
    const projectAdmin = vscode.extensions.getExtension('RichardJanisch.winccoa-project-admin');
    
    if (!projectAdmin) {
        ExtensionOutputChannel.debug('Project Admin not found - skipping project change subscription');
        return;
    }

    if (!projectAdmin.isActive) {
        await projectAdmin.activate();
    }

    const api = projectAdmin.exports;
    if (!api || !api.onDidChangeProject) {
        ExtensionOutputChannel.warn('Project Admin API not available for project change events');
        return;
    }

    // Subscribe to project changes
    api.onDidChangeProject(async (project: any) => {
        ExtensionOutputChannel.info('Project changed - reconnecting MCP Server...');
        
        // Invalidate config cache
        configDetector.invalidateCache();
        
        if (!project) {
            ExtensionOutputChannel.debug('No project selected');
            statusBar.setStatus('disconnected');
            handleDetectionError('no-project-selected');
            return;
        }

        ExtensionOutputChannel.info(`New project: ${project.name}`);

        // Reconnect to MCP Server with new project config
        try {
            const { config, error } = await configDetector.detectConfig();
            
            if (!config) {
                // Dispose old client when switching to project without MCP
                await disposeClient();
                handleDetectionError(error);
                statusBar.setStatus('error');
                return;
            }

            // Create new client (disposes old one automatically)
            await createClient(config);

            statusBar.setStatus('connected');
            ExtensionOutputChannel.info(`✅ Connected to ${config.projectName} MCP Server`);

            vscode.window.showInformationMessage(
                `Switched to ${config.projectName} - MCP Server reconnected`
            );

        } catch (error: any) {
            ExtensionOutputChannel.error(`Failed to reconnect: ${error.message}`);
            statusBar.setStatus('error');
            vscode.window.showErrorMessage(`MCP Server reconnection failed: ${error.message}`);
        }
    });

    ExtensionOutputChannel.info('Subscribed to Project Admin project changes');
}

/**
 * Get MCP Configuration (with auto-detection)
 * Returns current config if client is connected, otherwise detects
 */
async function getMcpConfig(): Promise<McpConfig | null> {
    // Return current config if client is connected
    if (mcpClient && currentConfig) {
        return currentConfig;
    }
    
    // Otherwise detect config
    const { config, error } = await configDetector.detectConfig();
    
    if (!config) {
        handleDetectionError(error);
        return null;
    }
    
    return config;
}

/**
 * Handle config detection errors
 */
async function handleDetectionError(error?: string): Promise<void> {
    switch (error) {
        case 'project-admin-missing':
            vscode.window.showWarningMessage(
                'WinCC OA Project Admin Extension required for auto-configuration',
                'Learn More'
            ).then(selection => {
                if (selection === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin'
                    ));
                }
            });
            break;

        case 'no-project-selected':
            // Don't show notification - red icon is enough indicator
            ExtensionOutputChannel.debug('No WinCC OA project selected');
            break;

        case 'mcp-not-installed':
        case 'env-file-missing':
            // Offer auto-setup wizard
            vscode.window.showWarningMessage(
                'MCP Server not found in current project',
                'Run Setup Wizard',
                'Manual Config'
            ).then(async selection => {
                if (selection === 'Run Setup Wizard') {
                    await vscode.commands.executeCommand('winccoa.mcp.runSetup');
                } else if (selection === 'Manual Config') {
                    ExtensionOutputChannel.show();
                }
            });
            break;

        case 'token-missing':
            vscode.window.showErrorMessage(
                'MCP_API_TOKEN not found in .env file. Please check your MCP Server installation.'
            );
            break;

        default:
            ExtensionOutputChannel.warn(`Unknown detection error: ${error}`);
    }
}

/**
 * Connect to MCP Server
 */
async function connect(): Promise<void> {
    try {
        // If already connected, show info
        if (mcpClient) {
            vscode.window.showInformationMessage(
                'Already connected to MCP Server',
                'Show Info',
                'Reconnect'
            ).then(selection => {
                if (selection === 'Show Info') {
                    vscode.commands.executeCommand('winccoa.mcp.showInfo');
                } else if (selection === 'Reconnect') {
                    vscode.commands.executeCommand('winccoa.mcp.reconnect');
                }
            });
            return;
        }

        statusBar.setStatus('connecting', 'Connecting...');

        const { config, error } = await configDetector.detectConfig();
        
        if (!config) {
            await handleDetectionError(error);
            statusBar.setStatus('error');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Connecting to MCP Server',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Connecting...' });
            
            await createClient(config);
            
            progress.report({ message: 'Connected!' });
            
            statusBar.setStatus('connected');
            
            vscode.window.showInformationMessage(
                `✅ Connected to ${config.projectName || 'WinCC OA'} MCP Server`
            );
        });
        
    } catch (error: any) {
        statusBar.setStatus('error', 'Connection failed');
        ExtensionOutputChannel.error(`Connect error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
    }
}

/**
 * Disconnect from MCP Server
 */
async function disconnect(): Promise<void> {
    if (!mcpClient) {
        vscode.window.showInformationMessage('Already disconnected from MCP Server');
        return;
    }

    try {
        ExtensionOutputChannel.info('Manual disconnect triggered...');
        
        await disposeClient();
        statusBar.setStatus('disconnected');
        
        vscode.window.showInformationMessage('Disconnected from MCP Server');
        
    } catch (error: any) {
        ExtensionOutputChannel.error(`Disconnect error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to disconnect: ${error.message}`);
    }
}

/**
 * Reconnect to MCP Server (called from Panel)
 */
async function reconnect(): Promise<void> {
    ExtensionOutputChannel.info('Manual reconnect triggered...');

    try {
        // Get current config
        const { config, error } = await configDetector.detectConfig();

        if (!config) {
            await handleDetectionError(error);
            statusBar.setStatus('error');
            return;
        }

        ExtensionOutputChannel.info(`Connecting to MCP Server: ${config.url}`);

        // Try to connect – if it fails, auto-start the manager and retry once
        try {
            await createClient(config);
        } catch (connectErr: any) {
            ExtensionOutputChannel.warn(
                `Initial connect failed (${connectErr.message}) – attempting to start MCP Server manager...`
            );

            const started = await tryStartMcpManager(config);
            if (started) {
                // Wait for the manager to initialise its HTTP endpoint
                ExtensionOutputChannel.info('Manager started – waiting 6 s for HTTP endpoint...');
                await new Promise(resolve => setTimeout(resolve, 6000));
                // Retry connection
                await createClient(config);
            } else {
                // Cannot start manager automatically – re-throw original error
                throw connectErr;
            }
        }

        // Reset monitor reconnect attempts
        if (connectionMonitor) {
            connectionMonitor.reset();
        }

        statusBar.setStatus('connected');
        ExtensionOutputChannel.info(`✅ Connected to ${config.projectName || 'WinCC OA'} MCP Server`);

        vscode.window.showInformationMessage(
            `Connected to ${config.projectName || 'WinCC OA'} MCP Server`
        );

    } catch (error: any) {
        ExtensionOutputChannel.error(`Reconnect failed: ${error.message}`);
        statusBar.setStatus('error');
        vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
    }
}

/**
 * Try to start the MCP Server manager via PmonComponent.
 * Returns true when a matching manager was found and the start command succeeded.
 */
async function tryStartMcpManager(config: McpConfig): Promise<boolean> {
    const { PmonComponent } = await import('@winccoa-tools-pack/npm-winccoa-core');
    const projectId = config.projectId;
    const version   = config.winCCOAVersion;

    if (!projectId) {
        ExtensionOutputChannel.warn('tryStartMcpManager: no projectId in config – skipping');
        return false;
    }

    try {
        const pmon = new PmonComponent();
        if (version) {
            try { pmon.setVersion(version); } catch {
                ExtensionOutputChannel.warn(`Could not set WinCC OA version ${version} for PMON`);
            }
        }

        // Find the MCP Server manager by matching startOptions
        const managers = await pmon.getManagerOptionsList(projectId);
        const mcpIndex = managers.findIndex(
            m => m.component === 'node' && m.startOptions?.includes('mcpServer')
        );

        if (mcpIndex < 0) {
            ExtensionOutputChannel.warn('tryStartMcpManager: MCP Server manager not found in PMON list');
            return false;
        }

        ExtensionOutputChannel.info(`Starting MCP Server manager at index ${mcpIndex}...`);
        const exitCode = await pmon.startManager(projectId, mcpIndex);

        if (exitCode === 0) {
            ExtensionOutputChannel.info('✅ MCP Server manager start command sent successfully');
            return true;
        }

        ExtensionOutputChannel.warn(`PMON startManager returned exit code ${exitCode}`);
        return false;

    } catch (err: any) {
        ExtensionOutputChannel.warn(`tryStartMcpManager failed: ${err.message}`);
        return false;
    }
}

/**
 * Execute WinCC OA Script via Script Actions Extension
 */
async function executeScript(scriptPath: string, args: string = ''): Promise<void> {
    try {
        ExtensionOutputChannel.info(`Execute Script requested: ${scriptPath} with args: ${args || '(none)'}`);

        // Find script file in workspace
        const files = await vscode.workspace.findFiles(`**/${scriptPath}`, '**/node_modules/**', 1);
        
        if (files.length === 0) {
            throw new Error(`Script not found: ${scriptPath}`);
        }

        const fileUri = files[0];

        // Check if Script Actions extension is available
        const scriptActionsExt = vscode.extensions.getExtension('richardjanisch.winccoa-script-actions');
        if (!scriptActionsExt) {
            throw new Error('WinCC OA Script Actions extension not installed');
        }

        // Execute script via Script Actions extension
        ExtensionOutputChannel.info(`Calling Script Actions: ${fileUri.fsPath} with args: ${args}`);
        
        await vscode.commands.executeCommand(
            'winccoa.executeScriptWithArgs',
            fileUri,
            args
        );

        ExtensionOutputChannel.info(`✅ Script execution started successfully`);
    } catch (error: any) {
        ExtensionOutputChannel.error(`executeScript error: ${error.message}`);
        throw error;
    }
}

/**
 * Run Setup Wizard to install MCP Server
 */
async function runSetup(): Promise<void> {
    try {
        ExtensionOutputChannel.info('Running MCP Server Setup Wizard...');

        // Get active project from Project Admin Extension
        const projectAdminExt = vscode.extensions.getExtension('RichardJanisch.winccoa-project-admin');
        if (!projectAdminExt) {
            vscode.window.showErrorMessage(
                'WinCC OA Project Admin Extension required for auto-setup',
                'Install Extension'
            ).then(selection => {
                if (selection === 'Install Extension') {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin'
                    ));
                }
            });
            return;
        }

        // Activate and get API
        const api = await projectAdminExt.activate();
        if (!api.getCurrentProject) {
            throw new Error('Project Admin Extension API not compatible');
        }

        const project = await api.getCurrentProject();
        if (!project) {
            vscode.window.showWarningMessage('No WinCC OA project selected. Please select a project first.');
            return;
        }

        ExtensionOutputChannel.info(`Running setup for project: ${project.name || project.id}`);

        // Project Admin API uses projectDir, not path
        const projectPath = project.projectDir;
        if (!projectPath) {
            throw new Error('Could not determine project path from Project Admin API (projectDir missing)');
        }

        ExtensionOutputChannel.info(`Project path: ${projectPath}`);
        ExtensionOutputChannel.info(`WinCC OA version: ${project.version}`);
        ExtensionOutputChannel.info(`WinCC OA install path: ${project.oaInstallPath}`);

        // Version check: MCP Server requires WinCC OA 3.20 or higher
        const minVersion = 3.20;
        const projectVersion = parseFloat(project.version);
        
        if (isNaN(projectVersion) || projectVersion < minVersion) {
            const errorMsg = `MCP Server requires WinCC OA 3.20 or higher.\n\nYour project uses version: ${project.version}\n\nPlease upgrade to WinCC OA 3.20+ to use the MCP Server.`;
            ExtensionOutputChannel.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg, { modal: true });
            return;
        }

        // Check if already installed
        const isInstalled = await SetupWizard.isMcpServerInstalled(projectPath);
        if (isInstalled) {
            const answer = await vscode.window.showWarningMessage(
                `MCP Server already installed in project "${project.name}".\n\nDo you want to delete and reinstall?`,
                { modal: true },
                'Yes, Reinstall',
                'Cancel'
            );
            
            if (answer !== 'Yes, Reinstall') {
                ExtensionOutputChannel.info('Setup cancelled - MCP Server already installed');
                return;
            }
            
            // User wants to reinstall - call resetAndReinstall
            const success = await SetupWizard.resetAndReinstall(
                projectPath, project.name || project.id, project.id, project.version
            );
            
            if (success) {
                configDetector.invalidateCache();
                await vscode.commands.executeCommand('winccoa.mcp.reconnect');
            }
            return;
        }

        // Run setup wizard (fresh install)
        const success = await SetupWizard.runSetup(
            projectPath, project.name || project.id, project.id, project.version
        );
        
        if (success) {
            // Invalidate cache and reconnect
            configDetector.invalidateCache();
            await vscode.commands.executeCommand('winccoa.mcp.reconnect');
        }
    } catch (error: any) {
        ExtensionOutputChannel.error(`Setup wizard error: ${error.message}`);
        vscode.window.showErrorMessage(`Setup failed: ${error.message}`);
    }
}

/**
 * Reset MCP Server (delete folder) and reinstall
 */
async function resetAndReinstall(): Promise<void> {
    try {
        ExtensionOutputChannel.info('Reset & Reinstall MCP Server...');

        // Get active project from Project Admin Extension
        const projectAdminExt = vscode.extensions.getExtension('RichardJanisch.winccoa-project-admin');
        if (!projectAdminExt) {
            vscode.window.showErrorMessage(
                'WinCC OA Project Admin Extension required for reset',
                'Install Extension'
            ).then(selection => {
                if (selection === 'Install Extension') {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin'
                    ));
                }
            });
            return;
        }

        // Activate and get API
        const api = await projectAdminExt.activate();
        if (!api.getCurrentProject) {
            throw new Error('Project Admin Extension API not compatible');
        }

        const project = await api.getCurrentProject();
        if (!project) {
            vscode.window.showWarningMessage('No WinCC OA project selected. Please select a project first.');
            return;
        }

        const projectPath = project.projectDir;
        if (!projectPath) {
            throw new Error('Could not determine project path from Project Admin API (projectDir missing)');
        }

        ExtensionOutputChannel.info(`Resetting MCP Server for project: ${project.name || project.id}`);
        ExtensionOutputChannel.info(`Project path: ${projectPath}`);
        ExtensionOutputChannel.info(`WinCC OA install path: ${project.oaInstallPath}`);

        // Version check: MCP Server requires WinCC OA 3.20 or higher
        const minVersion = 3.20;
        const projectVersion = parseFloat(project.version);
        
        if (isNaN(projectVersion) || projectVersion < minVersion) {
            const errorMsg = `MCP Server requires WinCC OA 3.20 or higher.\n\nYour project uses version: ${project.version}\n\nPlease upgrade to WinCC OA 3.20+ to use the MCP Server.`;
            ExtensionOutputChannel.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg, { modal: true });
            return;
        }

        // Confirm with user
        const answer = await vscode.window.showWarningMessage(
            `This will delete the MCP Server directory and reinstall from scratch.\n\nProject: ${project.name}\n\nManager entries will NOT be deleted.\n\nContinue?`,
            { modal: true },
            'Yes, Reset',
            'Cancel'
        );

        if (answer !== 'Yes, Reset') {
            ExtensionOutputChannel.info('Reset cancelled by user');
            return;
        }

        // Call SetupWizard.resetAndReinstall()
        const success = await SetupWizard.resetAndReinstall(
            projectPath, project.name || project.id, project.id, project.version
        );

        if (success) {
            vscode.window.showInformationMessage('MCP Server reset and reinstalled successfully!');
            // Invalidate cache and reconnect
            configDetector.invalidateCache();
            await vscode.commands.executeCommand('winccoa.mcp.reconnect');
        }
    } catch (error: any) {
        ExtensionOutputChannel.error(`Reset error: ${error.message}`);
        vscode.window.showErrorMessage(`Reset failed: ${error.message}`);
    }
}

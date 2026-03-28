/**
 * Manager Installation Helper
 *
 * Handles adding the MCP Server manager to WinCC OA:
 * 1. Runtime install via PmonComponent (insertManagerAt) when project is running
 * 2. Fallback to config/progs (ManagerConfigWriter) when PMON is not reachable
 * 3. Always ensures persistent config entry exists
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { PmonComponent, ProjEnvManagerOptions, ProjEnvManagerStartMode } from '@winccoa-tools-pack/npm-winccoa-core';
import { ManagerConfigWriter, ManagerEntry } from './managerConfigWriter';
import { ExtensionOutputChannel } from './extensionOutput';

/** Relative path of the MCP Server entry script (from project root) */
const MCP_SCRIPT_REL = 'mcpServer/index.js';
/** Keyword used to detect the manager in PMON and config/progs */
const MCP_MANAGER_KEY = 'mcpServer';

export class ManagerInstallationHelper {
    /**
     * Add (or verify existence of) the MCP Server manager.
     *
     * Strategy:
     *  1. Check config/progs for a persistent entry.
     *  2. Try PMON runtime install via PmonComponent.insertManagerAt().
     *     - If PMON is reachable and the manager is not yet present → insert at runtime.
     *     - If PMON is not reachable → fall through to step 3.
     *  3. Always ensure a persistent entry exists in config/progs.
     *
     * @param projectPath     Absolute path to the WinCC OA project directory
     * @param mcpServerPath   Absolute path to the mcpServer installation folder (unused, kept for signature compat)
     * @param projectId       WinCC OA project name/ID (used for PMON commands)
     * @param winCCOAVersion  WinCC OA version string, e.g. '3.21' (used to locate pmon binary)
     */
    static async addManagerAutomatically(
        projectPath: string,
        mcpServerPath: string,
        projectId: string,
        winCCOAVersion: string
    ): Promise<boolean> {
        try {
            ExtensionOutputChannel.info(`Adding MCP Server manager for project: ${projectId}`);

            // ── Step 1: Check persistent config/progs ────────────────────────────
            const existsInConfig = await ManagerConfigWriter.managerExists(
                projectPath, 'node', MCP_MANAGER_KEY
            );
            if (existsInConfig) {
                ExtensionOutputChannel.info('MCP Server manager already present in config/progs');
            }

            // ── Step 2: Try runtime install via PmonComponent ────────────────────
            let runtimeSuccess = false;
            try {
                const pmon = new PmonComponent();
                if (winCCOAVersion) {
                    try { pmon.setVersion(winCCOAVersion); } catch {
                        ExtensionOutputChannel.warn(`Could not set WinCC OA version ${winCCOAVersion} for PMON, using auto-detect`);
                    }
                }

                const managers = await pmon.getManagerOptionsList(projectId);
                const existsInPmon = managers.some(
                    m => m.component === 'node' && m.startOptions?.includes(MCP_MANAGER_KEY)
                );

                if (existsInPmon) {
                    ExtensionOutputChannel.info('MCP Server manager already running in PMON');
                    runtimeSuccess = true;
                } else {
                    const managerOptions: ProjEnvManagerOptions = {
                        component: 'node',
                        startMode: ProjEnvManagerStartMode.Manual,
                        secondToKill: 30,
                        resetMin: 1,
                        resetStartCounter: 3,
                        startOptions: MCP_SCRIPT_REL
                    };
                    const insertPosition = managers.length;
                    const exitCode = await pmon.insertManagerAt(managerOptions, projectId, insertPosition);

                    if (exitCode === 0) {
                        ExtensionOutputChannel.info('✅ MCP Server manager inserted into PMON at runtime');
                        runtimeSuccess = true;
                    } else {
                        ExtensionOutputChannel.warn(`PMON insertManagerAt returned exit code ${exitCode}, falling back to config/progs`);
                    }
                }
            } catch (pmonErr: any) {
                ExtensionOutputChannel.warn(
                    `PMON not reachable (${pmonErr.message}) – falling back to config/progs`
                );
            }

            // ── Step 3: Ensure persistent entry in config/progs ──────────────────
            if (!existsInConfig) {
                try {
                    const entry: ManagerEntry = {
                        component: 'node',
                        startMode: 'manual',
                        secKill: 30,
                        restartCount: 3,
                        resetMin: 1,
                        options: MCP_SCRIPT_REL
                    };
                    await ManagerConfigWriter.addManager(projectPath, entry);
                    ExtensionOutputChannel.info('✅ MCP Server manager added to config/progs');
                } catch (cfgErr: any) {
                    if (!runtimeSuccess) {
                        throw cfgErr; // both paths failed – propagate
                    }
                    ExtensionOutputChannel.warn(`Could not write config/progs: ${cfgErr.message}`);
                }
            }

            // ── Notify user ───────────────────────────────────────────────────────
            if (runtimeSuccess) {
                vscode.window.showInformationMessage(
                    '✅ MCP Server manager added. The project will start it automatically.'
                );
            } else {
                vscode.window.showInformationMessage(
                    '✅ MCP Server installed!\n\n' +
                    '⚠️ Restart the WinCC OA project to activate the MCP Server manager.',
                    { modal: true },
                    'OK'
                );
            }

            return true;

        } catch (error: any) {
            ExtensionOutputChannel.error(`Failed to add manager: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to add MCP Server manager: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Show manual installation instructions
     */
    static async showManualInstructions(
        projectPath: string,
        mcpServerPath: string
    ): Promise<void> {
        const scriptPath = path.join(mcpServerPath, 'index.js');
        const nextNum = await ManagerConfigWriter.getNextFreeManagerNumber(projectPath);
        
        const instructions = [
            '# Manual MCP Server Manager Setup',
            '',
            '## Option 1: Via PMON Console (Recommended)',
            '1. Open your WinCC OA project',
            '2. Open PMON Console',
            '3. Click "Add Manager" (or similar button)',
            '4. Configure the new JavaScript manager:',
            '',
            '**Manager Settings:**',
            `- Component: \`node\``,
            `- Start Mode: \`always\``,
            `- Seconds to Kill: \`30\``,
            `- Restart Count: \`3\``,
            `- Reset Min: \`1\``,
            `- Options: \`-num ${nextNum} mcpServer ${scriptPath}\``,
            '',
            '5. Save the manager configuration',
            '6. Start the manager manually',
            '',
            '## Option 2: Edit config/progs File',
            '1. Open the file: `<project>/config/progs`',
            '2. Add this line at the end (before comments):',
            '',
            '```',
            `node             | always |      30 |        3 |        1 |-num ${nextNum} mcpServer ${scriptPath}`,
            '```',
            '',
            '3. Save the file',
            '4. Restart your WinCC OA project',
            '5. Start the manager in PMON Console',
            '',
            '---',
            '',
            '**Copy the options line for easy use:**',
            `\`-num ${nextNum} mcpServer ${scriptPath}\``
        ].join('\n');
        
        // Create webview panel for instructions
        const panel = vscode.window.createWebviewPanel(
            'mcpManagerInstructions',
            'MCP Server Manager - Manual Setup',
            vscode.ViewColumn.One,
            {
                enableScripts: false
            }
        );
        
        panel.webview.html = this.getInstructionsHtml(instructions, scriptPath, nextNum);
        
        // Also log to output channel
        ExtensionOutputChannel.info('='.repeat(60));
        ExtensionOutputChannel.info('MCP Server Manager - Manual Setup Instructions');
        ExtensionOutputChannel.info('='.repeat(60));
        ExtensionOutputChannel.info(instructions);
        ExtensionOutputChannel.info('='.repeat(60));
    }
    
    /**
     * Show manager configuration details
     */
    private static showManagerDetails(manager: ManagerEntry): void {
        const details = [
            'Manager Configuration:',
            `- Component: ${manager.component}`,
            `- Start Mode: ${manager.startMode}`,
            `- Seconds to Kill: ${manager.secKill}`,
            `- Restart Count: ${manager.restartCount}`,
            `- Reset Min: ${manager.resetMin}`,
            `- Options: ${manager.options}`
        ].join('\n');
        
        vscode.window.showInformationMessage(details);
        ExtensionOutputChannel.info(details);
    }
    
    /**
     * Generate HTML for instructions webview
     */
    private static getInstructionsHtml(instructions: string, scriptPath: string, managerNum: number): string {
        // Convert markdown to simple HTML
        const htmlContent = instructions
            .replace(/^# (.*)/gm, '<h1>$1</h1>')
            .replace(/^## (.*)/gm, '<h2>$1</h2>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^---$/gm, '<hr>')
            .replace(/^```$/gm, '')
            .replace(/^\d+\. (.*)/gm, '<li>$1</li>')
            .replace(/^- (.*)/gm, '<li>$1</li>')
            .replace(/\n/g, '<br>');
        
        const optionsLine = `-num ${managerNum} mcpServer ${scriptPath}`;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Server Manager Setup</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            color: var(--vscode-textPreformat-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        h2 {
            color: var(--vscode-textLink-foreground);
            margin-top: 30px;
        }
        code {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        .copy-box {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            font-family: var(--vscode-editor-font-family);
        }
        .copy-box pre {
            margin: 0;
            overflow-x: auto;
        }
        strong {
            color: var(--vscode-textPreformat-foreground);
        }
        hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 30px 0;
        }
        ul {
            padding-left: 20px;
        }
        li {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <h1>🚀 MCP Server Manager - Manual Setup Instructions</h1>
    
    <h2>Option 1: Via PMON Console (Recommended)</h2>
    <ol>
        <li>Open your WinCC OA project</li>
        <li>Open PMON Console</li>
        <li>Click "Add Manager" or similar button</li>
        <li>Configure the new JavaScript manager with these settings:</li>
    </ol>
    
    <div class="copy-box">
        <strong>Manager Settings:</strong><br><br>
        <strong>Component:</strong> <code>node</code><br>
        <strong>Start Mode:</strong> <code>always</code><br>
        <strong>Seconds to Kill:</strong> <code>30</code><br>
        <strong>Restart Count:</strong> <code>3</code><br>
        <strong>Reset Min:</strong> <code>1</code><br>
        <strong>Options:</strong><br>
        <pre><code>${optionsLine}</code></pre>
    </div>
    
    <ol start="5">
        <li>Save the manager configuration</li>
        <li>Start the manager manually in PMON</li>
    </ol>
    
    <hr>
    
    <h2>Option 2: Edit config/progs File</h2>
    <ol>
        <li>Open the file: <code>&lt;project&gt;/config/progs</code></li>
        <li>Add this line at the end (before any comments):</li>
    </ol>
    
    <div class="copy-box">
        <pre>node             | always |      30 |        3 |        1 |${optionsLine}</pre>
    </div>
    
    <ol start="3">
        <li>Save the file</li>
        <li><strong>Restart your WinCC OA project</strong></li>
        <li>Start the manager in PMON Console</li>
    </ol>
    
    <hr>
    
    <h2>📋 Quick Copy - Options Line</h2>
    <div class="copy-box">
        <pre>${optionsLine}</pre>
    </div>
    
    <p><em>This is the exact options string to paste into the PMON Console manager configuration.</em></p>
</body>
</html>`;
    }
}

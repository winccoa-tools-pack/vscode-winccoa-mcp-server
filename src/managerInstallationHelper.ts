/**
 * Manager Installation Helper
 * 
 * Provides user dialogs and instructions for adding MCP Server manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ManagerConfigWriter, ManagerEntry } from './managerConfigWriter';
import { ExtensionOutputChannel } from './extensionOutput';

export class ManagerInstallationHelper {
    /**
     * Show dialog asking user if manager should be added automatically
     * @returns 'auto' | 'manual' | 'cancel'
     */
    static async askUserForInstallation(mcpServerPath: string): Promise<'auto' | 'manual' | 'cancel'> {
        const scriptPath = path.join(mcpServerPath, 'index.js');
        
        const message = [
            'MCP Server installation complete!',
            '',
            'To use the MCP Server, a WinCC OA manager must be added.',
            '',
            '⚠️ Note: After adding the manager, the project must be restarted.'
        ].join('\n');
        
        const choice = await vscode.window.showInformationMessage(
            message,
            {
                modal: true,
                detail: 'The manager will start automatically with the project (start mode: always, 3 retries).'
            },
            'Add Automatically',
            'Manual Instructions',
            'Cancel'
        );
        
        if (choice === 'Add Automatically') {
            return 'auto';
        } else if (choice === 'Manual Instructions') {
            return 'manual';
        } else {
            return 'cancel';
        }
    }
    
    /**
     * Add manager automatically and show restart reminder
     */
    static async addManagerAutomatically(
        projectPath: string,
        mcpServerPath: string
    ): Promise<boolean> {
        try {
            // Use relative path from project root
            const scriptPath = 'mcpServer\\index.js';
            
            // Check if manager already exists
            const exists = await ManagerConfigWriter.managerExists(
                projectPath,
                'node',
                scriptPath
            );
            
            if (exists) {
                vscode.window.showWarningMessage(
                    'MCP Server manager already exists in project configuration.'
                );
                return true;
            }
            
            // Create manager entry
            const manager: ManagerEntry = {
                component: 'node',
                startMode: 'always',
                secKill: 30,
                restartCount: 3,
                resetMin: 1,
                options: scriptPath
                // managerNumber will be auto-assigned
            };
            
            // Add to progs file
            await ManagerConfigWriter.addManager(projectPath, manager);
            
            // Show success message with restart reminder
            const restartChoice = await vscode.window.showInformationMessage(
                '✅ MCP Server manager added successfully!\n\n' +
                '⚠️ IMPORTANT: You must restart the WinCC OA project for the manager to appear.\n\n' +
                'After restart, the manager will start automatically (start mode: always).',
                {
                    modal: true
                },
                'OK',
                'Show Manager Details'
            );
            
            if (restartChoice === 'Show Manager Details') {
                this.showManagerDetails(manager);
            }
            
            return true;
            
        } catch (error: any) {
            ExtensionOutputChannel.error(`Failed to add manager: ${error.message}`);
            vscode.window.showErrorMessage(
                `Failed to add MCP Server manager: ${error.message}`
            );
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

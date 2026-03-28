/**
 * Manager Configuration Writer
 *
 * Writes manager entries directly to WinCC OA progs config file.
 * This is required because PMON's SINGLE_MGR:INS command only modifies
 * the runtime state, not the persistent configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExtensionOutputChannel } from './extensionOutput';

export interface ManagerEntry {
    component: string;
    startMode: 'manual' | 'once' | 'always';
    secKill: number;
    restartCount: number;
    resetMin: number;
    options: string;
    managerNumber?: number; // Optional: If not provided, will be auto-assigned
}

export class ManagerConfigWriter {
    /**
     * Find the next free manager number from progs file
     * @param projectPath - Absolute path to WinCC OA project
     * @returns Next free manager number
     */
    static async getNextFreeManagerNumber(projectPath: string): Promise<number> {
        const progsPath = path.join(projectPath, 'config', 'progs');

        if (!fs.existsSync(progsPath)) {
            return 1; // Default to 1 if no progs file exists
        }

        const content = fs.readFileSync(progsPath, 'utf8');
        const lines = content.split('\n');

        const usedNumbers = new Set<number>();

        for (const line of lines) {
            // Skip comments, headers, empty lines
            const trimmed = line.trim();
            if (
                !trimmed ||
                trimmed.startsWith('#') ||
                trimmed.startsWith('version') ||
                trimmed.startsWith('auth')
            ) {
                continue;
            }

            // Look for -num X pattern in options
            const numMatch = line.match(/-num\s+(\d+)/);
            if (numMatch) {
                usedNumbers.add(parseInt(numMatch[1], 10));
            }
        }

        // Find first free number starting from 1
        let nextNumber = 1;
        while (usedNumbers.has(nextNumber)) {
            nextNumber++;
        }

        ExtensionOutputChannel.debug(
            `ManagerConfigWriter: Next free manager number: ${nextNumber}`,
        );
        return nextNumber;
    }

    /**
     * Add a manager to the progs file
     * @param projectPath - Absolute path to WinCC OA project
     * @param manager - Manager configuration
     * @returns true if successful
     */
    static async addManager(projectPath: string, manager: ManagerEntry): Promise<boolean> {
        const progsPath = path.join(projectPath, 'config', 'progs');

        ExtensionOutputChannel.info(`ManagerConfigWriter: Adding manager to ${progsPath}`);

        if (!fs.existsSync(progsPath)) {
            throw new Error(`progs file not found: ${progsPath}`);
        }

        try {
            // Read existing file
            const content = fs.readFileSync(progsPath, 'utf8');
            const lines = content.split('\n');

            // Find insertion point (before trailing comments/empty lines)
            let insertIndex = lines.length;
            for (let i = lines.length - 1; i >= 0; i--) {
                const trimmed = lines[i].trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    insertIndex = i + 1;
                    break;
                }
            }

            // Auto-assign manager number if not provided
            let finalOptions = manager.options;
            if (manager.managerNumber && !manager.options.includes('-num')) {
                // Only add -num if explicitly requested via managerNumber property
                finalOptions = `-num ${manager.managerNumber} ${manager.options}`;
                ExtensionOutputChannel.info(
                    `ManagerConfigWriter: Using manager number: ${manager.managerNumber}`,
                );
            }

            // Format manager entry
            const startMode = manager.startMode.padEnd(6);
            const secKill = manager.secKill.toString().padStart(8);
            const restartCount = manager.restartCount.toString().padStart(8);
            const resetMin = manager.resetMin.toString().padStart(8);

            const managerLine = `${manager.component.padEnd(
                16,
            )} | ${startMode} |${secKill} |${restartCount} |${resetMin} |${finalOptions}`;

            // Insert new manager
            lines.splice(insertIndex, 0, managerLine);

            // Write back
            fs.writeFileSync(progsPath, lines.join('\n'), 'utf8');

            ExtensionOutputChannel.info(
                `ManagerConfigWriter: Successfully added manager: ${manager.component}`,
            );
            ExtensionOutputChannel.debug(`ManagerConfigWriter: Entry: ${managerLine}`);

            return true;
        } catch (error: any) {
            ExtensionOutputChannel.error(
                `ManagerConfigWriter: Failed to add manager: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Check if a manager with given component and options already exists
     */
    static async managerExists(
        projectPath: string,
        component: string,
        options: string,
    ): Promise<boolean> {
        const progsPath = path.join(projectPath, 'config', 'progs');

        if (!fs.existsSync(progsPath)) {
            return false;
        }

        const content = fs.readFileSync(progsPath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
            // Skip comments and headers
            if (
                line.trim().startsWith('#') ||
                line.trim().startsWith('version') ||
                line.trim().startsWith('auth')
            ) {
                continue;
            }

            // Check if line contains component and options
            if (line.includes(component) && line.includes(options)) {
                return true;
            }
        }

        return false;
    }
}

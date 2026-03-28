/**
 * Connection Monitor
 *
 * Monitors MCP Server connection with heartbeat checks and auto-reconnect.
 */

import { ExtensionOutputChannel } from './extensionOutput';
import { McpClient } from './mcpClient';
import { McpConfig } from './projectConfigDetector';

export interface ConnectionMonitorConfig {
    heartbeatInterval: number; // ms
    reconnectRetries: number;
    autoReconnect: boolean;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export class ConnectionMonitor {
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts: number = 0;
    private isMonitoring: boolean = false;
    private currentStatus: ConnectionStatus = 'disconnected';

    private config: ConnectionMonitorConfig;
    private getClient: () => McpClient | null;
    private onConnectionLost: () => Promise<void>;
    private onReconnectSuccess: () => void;
    private onReconnectFailed: () => void;

    constructor(
        config: ConnectionMonitorConfig,
        getClient: () => McpClient | null,
        onConnectionLost: () => Promise<void>,
        onReconnectSuccess: () => void,
        onReconnectFailed: () => void,
    ) {
        this.config = config;
        this.getClient = getClient;
        this.onConnectionLost = onConnectionLost;
        this.onReconnectSuccess = onReconnectSuccess;
        this.onReconnectFailed = onReconnectFailed;
    }

    /**
     * Start monitoring connection
     */
    start(): void {
        if (this.isMonitoring) {
            ExtensionOutputChannel.debug('Connection Monitor: Already running');
            return;
        }

        ExtensionOutputChannel.info(
            `Connection Monitor: Starting (interval: ${this.config.heartbeatInterval}ms)`,
        );
        this.isMonitoring = true;
        this.currentStatus = 'connected';
        this.reconnectAttempts = 0;

        this.scheduleNextHeartbeat();
    }

    /**
     * Stop monitoring connection
     */
    stop(): void {
        if (!this.isMonitoring) {
            return;
        }

        ExtensionOutputChannel.info('Connection Monitor: Stopping');
        this.isMonitoring = false;
        this.currentStatus = 'disconnected';

        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Reset reconnect attempts (e.g., after successful manual reconnect)
     */
    reset(): void {
        this.reconnectAttempts = 0;
        this.currentStatus = 'connected';
        ExtensionOutputChannel.debug('Connection Monitor: Reset');
    }

    /**
     * Get current connection status
     */
    getStatus(): ConnectionStatus {
        return this.currentStatus;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ConnectionMonitorConfig>): void {
        this.config = { ...this.config, ...config };
        ExtensionOutputChannel.debug(
            `Connection Monitor: Config updated - ${JSON.stringify(this.config)}`,
        );

        // Restart with new interval if monitoring
        if (this.isMonitoring) {
            this.stop();
            this.start();
        }
    }

    /**
     * Schedule next heartbeat check
     */
    private scheduleNextHeartbeat(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.heartbeatTimer = setTimeout(() => {
            this.checkConnection();
        }, this.config.heartbeatInterval);
    }

    /**
     * Check connection (heartbeat)
     */
    private async checkConnection(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        ExtensionOutputChannel.debug('Connection Monitor: Heartbeat check');

        const client = this.getClient();
        if (!client) {
            ExtensionOutputChannel.warn('Connection Monitor: No client available');
            this.scheduleNextHeartbeat();
            return;
        }

        try {
            const isConnected = await client.testConnection();

            if (isConnected) {
                ExtensionOutputChannel.debug('Connection Monitor: ✅ Heartbeat OK');

                // Connection restored after reconnecting
                if (this.currentStatus === 'reconnecting') {
                    this.currentStatus = 'connected';
                    this.reconnectAttempts = 0;
                    this.onReconnectSuccess();
                }

                this.scheduleNextHeartbeat();
            } else {
                // Connection lost
                ExtensionOutputChannel.warn(
                    'Connection Monitor: ❌ Heartbeat failed - connection lost',
                );
                await this.handleConnectionLost();
            }
        } catch (error: any) {
            ExtensionOutputChannel.error(`Connection Monitor: Heartbeat error - ${error.message}`);
            await this.handleConnectionLost();
        }
    }

    /**
     * Handle connection lost
     */
    private async handleConnectionLost(): Promise<void> {
        this.currentStatus = 'error';

        // Notify parent
        await this.onConnectionLost();

        // Auto-reconnect if enabled
        if (this.config.autoReconnect && this.reconnectAttempts < this.config.reconnectRetries) {
            await this.attemptReconnect();
        } else {
            ExtensionOutputChannel.error(
                `Connection Monitor: Auto-reconnect ${
                    this.config.autoReconnect ? 'exhausted' : 'disabled'
                }`,
            );
            this.onReconnectFailed();
            this.stop();
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    private async attemptReconnect(): Promise<void> {
        this.reconnectAttempts++;
        this.currentStatus = 'reconnecting';

        // Exponential backoff: 2s, 4s, 8s
        const backoffMs = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 8000);

        ExtensionOutputChannel.info(
            `Connection Monitor: Reconnect attempt ${this.reconnectAttempts}/${this.config.reconnectRetries} ` +
                `in ${backoffMs}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, backoffMs));

        // Check if still monitoring (might have been stopped)
        if (!this.isMonitoring) {
            return;
        }

        // Try heartbeat again (will trigger handleConnectionLost if still fails)
        this.scheduleNextHeartbeat();
    }
}

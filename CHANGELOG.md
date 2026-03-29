# Changelog

All notable changes to the "WinCC OA MCP Server" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.2] - 2026-03-29

### 🐛 Fixed
- **CI/CD Pipeline**: Removed non-existent VSCode integration test configuration
  - Disabled `enable_coverage` (no integration tests to measure)
  - Disabled `enable_xvfb` (no VSCode UI tests)
  - Removed `integration_test_command` (no `vscode-test` setup exists)
  - Pipeline now only runs TypeScript compilation check

## [1.9.1] - 2026-03-29

### ✨ Added
- **Port Configuration UI**: New "Change Port" action in Server Info dialog
  - Input validation (1024-65535, avoid port 3000)
  - Automatic `.env` file update
  - WinCC OA manager restart (stop → start)
  - Progress notification with detailed steps
  - Config cache invalidation for immediate UI updates

### 🐛 Fixed
- **HTTP 400 Error in showServerInfo**: Removed buggy `client.initialize()` call that was causing Bad Request errors
- **Server Info Dialog**: Simplified to show current config instead of fetching server data (no more MCP requests)
- **Port Change Cache Bug**: Config cache is now invalidated before reconnect, ensuring new port is shown immediately in UI

### 🗑️ Removed
- **Dead Code Cleanup**: Removed 715 lines of unused panel UI code
  - Deleted `mcpPanel.ts` (386 lines) - never registered or imported
  - Deleted `mcpPanelView.ts` (329 lines) - never registered or imported

## [1.9.0] - 2026-03-28

### ✨ Added
- **Native VS Code MCP integration**: Extension now writes the WinCC OA MCP Server config directly into VS Code global User Settings (`mcp.servers.winccoa`) on every successful connection. GitHub Copilot and all MCP consumers in VS Code pick up all 30+ server tools automatically — no extension-side tool wrappers needed. Config is updated on every project switch.

### 🗑️ Removed
- **LM Tool wrappers** (`languageModelTools.ts`, 1193 lines): Deleted — replaced by native `mcp.servers` settings entry. The 16 wrapped tools were also using outdated tool names (broken since MCP Server v0.1.4).
- **Chat Participant** (`chatParticipant.ts`, 265 lines): Deleted — was dead code (not imported in `extension.ts`, no `contributes.chatParticipants` entry).
- **`contributes.languageModelTools`** in `package.json`: All ~553 lines of tool schema declarations removed; VS Code/Copilot reads schemas directly from the running MCP Server.
- **`McpClient.callTool()` / `readResource()` / `McpToolResult`**: Removed from `mcpClient.ts`; `McpClient` is now only used for health-check pings (`testConnection()`) and server info queries (`listTools()`, `listResources()`).

### 🏗️ Build
- VSIX size reduced significantly (no large `contributes.languageModelTools` blob in manifest).

## [1.8.0] - 2026-03-28

> Based on [PR #37](https://github.com/winccoa-tools-pack/vscode-winccoa-mcp-server/pull/37) by [@JaMa-95](https://github.com/JaMa-95)

### ✨ Added
- **Public Extension API**: New `McpServerExtensionApi` interface allows other VS Code extensions (e.g. `vscode-winccoa-database`) to consume MCP connection info via `vscode.extensions.getExtension(...).activate()`
  - `getConnectionInfo()` — returns URL, token, auth type and project details
  - `getConnectionState()` — returns current connection state (`connected` | `disconnected` | `connecting` | `error`)
  - `onDidChangeConnection` — event fired on connection state or config changes

### 🔧 Improved
- **GitHub Release Installation**: Setup wizard now downloads the latest MCP Server release artifact (`.tar.gz`) directly from GitHub Releases instead of cloning the git repository or using npm install
  - Automatic detection of subdirectory prefix inside the release archive
  - No `simple-git` dependency required anymore
  - `winccoa-manager` is now bundled in the release artifact — no separate manager installation step
  - `oaInstallPath` parameter removed from public setup methods (no longer needed)

### 🐛 Fixed
- **Manager Installation via PmonComponent**: Setup wizard now correctly adds the WinCC OA manager at runtime using `PmonComponent.insertManagerAt()` when the project is already running
  - `runSetup` (fresh install): automatically adds the manager after installation — no more manual dialog
  - `resetAndReinstall` (reinit): always deletes and re-downloads the package, then checks if manager already exists; adds it only if missing
  - Fallback to `config/progs` write when PMON is not reachable (e.g. project not running)
  - Persistent `config/progs` entry always written for restart durability
  - Script path corrected to `mcpServer/index.js` (relative from `javascript/` working dir)
  - Manager start mode set to **Manual** — started on demand, not automatically with the project
- **Auto-Start on Connect**: When the HTTP endpoint is not reachable during connect/reconnect, the manager is started automatically via `PmonComponent.startManager()` — 6 s wait for HTTP endpoint, graceful fallback if PMON unavailable

### 🏗️ Build
- Added `.vscodeignore` to exclude dev files (scripts, docs, test fixtures) from VSIX package

### 📊 Dependencies
- Removed: `simple-git` (replaced by direct GitHub Release download)
- Moved: `@winccoa-tools-pack/npm-winccoa-core` from devDependencies → dependencies (required for `PmonComponent` runtime manager installation), updated to `0.2.6`

## [1.7.0] - 2026-02-14

### ✨ Added
- **Runtime Manager Installation via PMON**: MCP Server manager is now added at runtime without requiring project restart
  - Direct integration with `npm-winccoa-core` PmonComponent for immediate manager installation
  - Manager appears instantly in PMON Console after installation
  - Automatic version detection from Project Admin Extension with config file fallback
  - Comprehensive logging throughout installation process for debugging
  - Intelligent duplicate detection prevents adding manager multiple times

### 🔧 Improved
- **Robust Version Handling**: Multi-source version detection with priority fallback
  - Primary: Get version from Project Admin Extension via `getCurrentProject().version`
  - Fallback: Extract from project `config/config` file `pvss_path` entry
  - Clear logging when using fallback methods
- **Manager Configuration**: Optimized settings for reliable operation
  - Start Mode: Always (automatic start with project)
  - 6-second initialization wait for HTTP endpoint availability
  - 3 automatic restart attempts on failure
  - 30-second graceful shutdown timeout
- **Error Resilience**: Multiple fallback strategies ensure installation succeeds
  - PMON runtime installation as primary method
  - config/progs file modification as fallback for older WinCC OA versions
  - Detailed error messages with recovery suggestions
- **Reset & Reinstall Workflow**: Automatically adds manager after MCP Server reinstallation
  - No manual intervention required
  - Consistent manager configuration across reinstalls

### 📊 Dependencies
- Updated: `@winccoa-tools-pack/npm-winccoa-core` to 0.2.3 (moved to runtime dependencies)
- Integration with Project Admin Extension v2.2.0+ for version information

## [1.6.2] - 2026-01-26

### 🔧 Fixed
- Updated workspace configuration to use FinalMCPTest project

## [1.6.1] - 2026-01-25

### 🛠️ Improved
- **Language Model Tool JSON Schemas**: Comprehensive improvements to all tool input schemas for better AI code generation
  - **CRITICAL FIX**: Corrected Modbus `datatype` range to 550-568 (was incorrectly limited to 555-561,566) - now includes all WinCC OA Modbus datatypes (COIL, DISCRETE_INPUT, HOLDING_REGISTER, INPUT_REGISTER, INT16, UINT16, INT32, UINT32, FLOAT32, FLOAT64, STRING)
  - **CRITICAL FIX**: Corrected Modbus `direction` range to 0-15 (was incorrectly limited to 1,4,7) - now includes all address modes (UNDEFINED, OUTPUT, INPUT_SPONT, INPUT_POLL, IO_SPONT, IO_POLL, INPUT_CYCLIC_ON_USE, etc.)
  - Added `integer` type with min/max constraints for numeric IDs (connection, device, register, system, dp)
  - Added enums for fixed-value parameters (alarm direction ASC/DESC, archive classes)
  - Added `pattern` validation for datapoint names (`^[a-zA-Z][a-zA-Z0-9_]*$`)
  - Added comprehensive descriptions with real-world examples for all parameters
  - Added default values for optional parameters
  - Improved tools: `winccoa_modbus_address_set`, `winccoa_create_datapoint`, `winccoa_dp_set`, `winccoa_alarm_set`, `winccoa_archive_set`, `winccoa_common_set`, `winccoa_pv_range_set`, `winccoa_get_value`, `winccoa_get_dptypes`, `winccoa_get_datapoints`, `winccoa_get_manager_status`
  - **Validation**: All schemas verified against actual MCP Server implementation in `winccoa-ae-js-mcpserver` repository
  - **Impact**: GitHub Copilot and Claude now generate significantly more accurate JSON parameters, reducing configuration errors

## [1.6.0] - 2026-01-25

### ✨ Added
- **Git Repository Installation Support**: Install MCP Server from custom Git repositories
  - New setting `winccoa.mcp.installMethod`: Choose between "npm" or "git" installation
  - New setting `winccoa.mcp.gitRepositoryUrl`: Configure custom Git repository URL
  - New setting `winccoa.mcp.gitBranch`: Select specific branch for installation
  - Default configuration uses RichardJanisch fork with Modbus enhancements
  - Full TypeScript build workflow integrated (clone → build → install)
  - Production-ready installation matching NPM package structure

### 📊 Enhanced
- **Flexible MCP Server Sources**: Users can now install from custom forks with additional features
- **Automatic Build Process**: TypeScript compilation and dependency management handled automatically
- **Identical Output**: Git installation produces identical structure as NPM package
  - Proper file flattening (build/* to root)
  - All configuration files copied (.env.example, systemprompt.md, etc.)
  - Production dependencies installed correctly
  - winccoa-manager integration maintained

### 🔧 Fixed
- Resolved PMON settings issue in .env (removed invalid settings that caused startup failures)
- Fixed package-lock.json conflicts during Git installation
- Improved cleanup of temporary build directories

## [1.5.0] - 2026-01-24

### ✨ Added
- **Modbus Address Configuration Tools**: 3 new tools for Modbus device integration
  - **Get Address Config**: `winccoa_modbus_address_get` - Retrieve Modbus address settings
  - **Set Address Config**: `winccoa_modbus_address_set` - Configure Modbus addresses for datapoints
  - **Remove Address Config**: `winccoa_modbus_address_remove` - Remove Modbus address configuration

### 📊 Enhanced
- **Tool Count**: Expanded from 13 to 16 Language Model Tools
  - Seamless integration with WinCC OA Modbus driver
  - Supports peripheral and distribution address configuration
  - Compatible with existing Modbus connection setup

## [1.4.0] - 2026-01-23

### ✨ Added
- **Write Operations Support**: 8 new Language Model Tools for data manipulation
  - **Datapoint Creation**: `winccoa_create_datapoint` - Create datapoints
  - **Value Writing**: `winccoa_dp_set` - Write values (with user confirmation for safety!)
  - **Datapoint Type Creation**: `winccoa_create_dp_type` - Define DPT structures
  - **Alarm Configuration**: `winccoa_alarm_set` / `winccoa_alarm_delete` - Manage alarm configuration
  - **Archive Configuration**: `winccoa_archive_set` - Enable archiving
  - **Common Config**: `winccoa_common_set` - Set description, alias, unit, format
  - **PV Range**: `winccoa_pv_range_set` - Configure min/max values
- **Safety Features**: All write operations require user confirmation
  - Confirmation dialog with operation details
  - Warning messages for critical operations (e.g., equipment control)
  - Clear indicators for irreversible changes

### 📊 Enhanced
- **Tool Count**: Expanded from 5 to 13 Language Model Tools
  - 5 Read-Only Tools (Manager, Datapoints, Values, Types, Status)
  - 8 Write Tools (Create, Set, Configure, Delete)
- **MCP Server Integration**: Full integration of all available write tools
  - Compatible with winccoa-ae-js-mcpserver tools
  - Supports all configuration options (force, thresholds, classes, etc.)

### 🛡️ Security
- **User Confirmation**: All write operations require explicit confirmation
- **Warning Messages**: Clear warnings for critical operations
- **Safety-First Design**: Copilot cannot make changes without user approval

## [1.3.0] - 2026-01-18

### 🎯 Changed
- **Removed Chat Participant (@winccoa)**: Simplified to Language Model Tools only
  - GitHub Copilot now uses tools directly without chat participant interface
  - Cleaner integration, better performance
  - Focus on tool-based AI assistance

### 🐛 Fixed
- **Path Quoting for WinCC OA 3.21**: Fixed npm install failure for paths with spaces
  - Properly quotes `file:C:\Program Files\Siemens\WinCC_OA\3.21\...` paths
  - Prevents "ENOENT: no such file or directory, open 'C:\Program\package.json'" error
- **Manager Entry Simplified**: Now uses relative path only
  - Changed from absolute path to `mcpServer\index_http.js`
  - Removed automatic `-num X` flag assignment
  - Manager entry: `node | always | ... | mcpServer\index_http.js`

## [1.2.0] - 2026-01-18

### 🎯 Changed
- **Clear Responsibilities**: Removed Execute Script Tool from MCP Extension
  - Script execution now exclusively handled by Script Actions Extension
  - MCP Extension focuses on MCP Server lifecycle management only
  - Tools: 5 MCP Server tools (managers, datapoints, values, types, status)

### 🛠️ Architecture
- **Extension Separation**: Each extension owns its specific Language Model Tools
  - MCP Server Extension: Server management + MCP tools
  - Script Actions Extension: Script execution (`scriptactions_execute_script`)
  - CTL Language Extension: Language features (`ctl_*` tools)
  - LogViewer Extension: Log analysis (`logviewer_*` tools)

## [1.1.1] - 2026-01-18

### Added
- **Reset & Reinstall Command**: Quick reset for debugging MCP Server setup issues
  - Deletes `javascript/mcpServer` folder and reinstalls from scratch
  - Manager entries in `config/progs` are preserved
  - Accessible via "Run Setup Wizard" button when already installed
- **Version Check**: Blocks installation for WinCC OA versions < 3.20
  - Shows clear error message with version requirement
  - Prevents installation attempts on unsupported versions

### Changed
- **🔧 BREAKING: NPM Package Installation**: Migrated from Git Clone to NPM package
  - Now installs `@etm-professional-control/winccoa-mcp-server` package
  - Pre-built JavaScript files, no TypeScript compilation needed
  - No bash build script required (Windows compatible)
  - Faster and more reliable installation
- **Windows Path Support**: Uses Project Admin Extension for WinCC OA paths
  - Automatically detects Windows registry paths (C:\Siemens\Automation\WinCC_OA\)
  - No more hardcoded `/opt/WinCC_OA/` Linux paths
  - Cross-platform compatibility (Windows + Linux)

### Fixed
- **Manager Script Path**: Corrected to `javascript/mcpServer/index_http.js`
  - Was: `javascript/mcpServer/mcpWinCCOA/build/index_http.js`
  - Matches NPM package structure
- **.env Detection Path**: Fixed to `javascript/mcpServer/.env`
  - Was: `javascript/mcpServer/mcpWinCCOA/build/.env`
  - Connection checks now find configuration correctly
- **npm install Error**: Resolved "Cannot read properties of undefined (reading 'extraneous')"
  - Root cause: Incompatible package-lock.json from Git Clone
  - Solution: NPM package has compatible dependencies

### Technical Notes
- **Architecture Change**: WinCC OA installation path now provided by Project Admin Extension
  - Single source of truth for project metadata
  - No duplicate path detection logic
- **Simplified Installation**: Reduced from 5 steps to 4 steps
  - ~~Step 1: Clone Repository~~ → Install NPM Package
  - ~~Step 2: Install Dependencies~~ → (included in NPM package)
  - Step 2: Install WinCC OA Manager (peer dependency)
  - Step 3: Generate Token
  - Step 4: Create .env
  - ~~Step 5: Build TypeScript~~ → (pre-built in NPM package)

## [1.1.0] - 2026-01-15

### Added
- **Automatic Manager Installation**: Post-setup dialog for WinCC OA manager configuration
  - User choice: Automatic installation or manual instructions
  - Automatic mode: Writes manager to `config/progs` file with restart reminder
  - Manual mode: Shows comprehensive setup instructions in webview panel
- **Smart Manager Number Assignment**: Automatically finds next free `-num X` number
  - Scans existing managers for used numbers
  - Prevents conflicts with existing manager numbers
- **Manager Configuration Writer**: File-based manager entry creation
  - Writes directly to `config/progs` file for persistence
  - Proper formatting matching WinCC OA expectations
  - Duplicate detection to prevent multiple entries
- **Comprehensive Manual Instructions**: Two setup methods provided
  - **Option 1 (Recommended)**: Via PMON Console with exact configuration values
  - **Option 2**: Direct `config/progs` file editing with formatted entry
  - Copy-ready manager options string for easy setup

### Changed
- **Setup Wizard**: Replaced TODO with integrated manager installation workflow
  - Post-installation manager setup dialog
  - Clear restart requirements communicated to user
- **Manager Options Format**: Uses `-num X mcpServer <path>` format
  - Follows WinCC OA JavaScript manager conventions
  - Auto-assigns next free manager number

### Technical Notes
- **PMON Runtime Limitation**: PMON `SINGLE_MGR:INS` command is runtime-only, does NOT persist to config
- **File-Based Approach**: Direct `config/progs` writing is the only way to persistently add managers
- **Restart Requirement**: WinCC OA project must be restarted for new managers to appear in PMON

## [1.0.0] - 2026-01-15

### Added
- **connect command**: Manual connection to MCP Server with already-connected detection
- **disconnect command**: Manual disconnection from MCP Server
- **Context-Sensitive Menu**: showMenu() displays different options based on connection status
  - Connected: Show Server Info, Disconnect, Reconnect, Show Logs
  - Disconnected: Connect, Run Setup, Show Logs

### Changed
- **Command Structure**: Simplified and more semantic command naming
  - `testConnection` → `connect` (more intuitive)
  - Added explicit `disconnect` command
  - All commands properly documented
- **showMenu()**: Now context-aware, shows relevant actions only
- **Status Bar**: getCurrentStatus() method for context detection

### Removed
- **testConnection command**: Replaced by more semantic `connect` command

### Fixed
- **Command Naming**: "Test Connection" was confusing (it actually connected, not just tested)

## [0.9.0] - 2026-01-15

### Added
- **User Settings**: Configuration options in VS Code Settings UI
  - `winccoa.mcp.logLevel`: Filter log output (debug, info, warn, error)
  - `winccoa.mcp.autoReconnect`: Enable/disable automatic reconnection (default: true)
  - `winccoa.mcp.reconnectRetries`: Configure retry attempts 0-10 (default: 3)
  - `winccoa.mcp.heartbeatInterval`: Configure heartbeat check frequency 5s-5min (default: 30s)
  - `winccoa.mcp.showNotifications`: Toggle reconnect notifications (default: true)
- **Log Level Filtering**: ExtensionOutputChannel respects log level setting
- **Settings Integration**: Connection monitor reads settings on startup

### Changed
- **startConnectionMonitor()**: Reads user settings instead of hardcoded values
- **handleReconnectSuccess/Failed()**: Respect showNotifications setting
- **ExtensionOutputChannel**: Added log level filtering logic

### Fixed
- **Log Spam**: Users can now reduce verbosity by setting logLevel to 'warn' or 'error'

## [0.8.0] - 2026-01-15

### Added
- **Connection Monitor**: Heartbeat-based connection monitoring with 30s interval (hardcoded, configurable in 0.9.0)
- **Auto-Reconnect**: Automatic reconnection on connection loss with exponential backoff (2s, 4s, 8s)
- **Reconnect Retries**: Up to 3 automatic reconnect attempts before giving up
- **Connection Status**: New status states: connected, disconnected, reconnecting, error
- **User Notifications**: Auto-reconnect success/failure messages

### Changed
- **createClient()**: Now starts connection monitoring automatically
- **disposeClient()**: Stops connection monitor when disposing client
- **reconnect()**: Resets monitor reconnect attempts on manual reconnect
- **Extension Deactivate**: Stops connection monitor on extension shutdown

### Fixed
- **Silent Connection Loss**: Extension now detects when MCP Server becomes unavailable
- **Connection Failures**: Automatic recovery attempts with user notification

## [0.7.0] - 2026-01-15

### Added
- **Persistent Client**: Global MCP client instance reused across commands
- **Lifecycle Management**: `createClient()`, `disposeClient()`, `getClient()` functions
- **Automatic Disposal**: Old client disposed when creating new one (prevents memory leaks)
- **Extension Deactivation**: Client properly disposed when extension deactivates

### Changed
- **Project Change Handling**: Disposes old client and creates new one when switching projects
- **Chat Participant Update**: Chat participant updated when client changes
- **getMcpConfig()**: Returns cached config if client is connected
- **showServerInfo()**: Uses existing client instead of creating new one
- **testConnection()**: Reuses existing client if available
- **reconnect()**: Uses createClient() for consistent behavior

### Fixed
- **Memory Leak**: Old clients no longer stay in memory on project change
- **Chat Participant Stale Client**: Chat commands now work with current project after switching
- **Language Model Tools Update**: Tools properly updated when client changes

## [0.6.1] - 2026-01-15

### Fixed
- **Chat Participant async/sync mismatch**: `getMcpConfig()` is now properly awaited in `handleRequest()` to prevent "Cannot use 'in' operator" error
- **Reconnect command**: Now creates new `McpClient` instance instead of reusing non-existent client after setup
- **Client initialization**: Chat Participant properly initializes MCP client with awaited config

### Changed
- Chat Participant constructor receives config getter function, client created on-demand in handleRequest
- Reconnect command now properly instantiates client, initializes connection, and updates Language Model Tools

## [0.6.0] - 2026-01-13

### Added
- **Auto-Setup Wizard**: Automatic MCP Server installation for projects without MCP
  - Repository cloning (`git clone`)
  - NPM dependency installation
  - Secure token generation (crypto.randomBytes)
  - `.env` file creation with configuration
  - MCP Server build process
  - PMON integration instructions (manual step for now)
- **Setup Detection**: Automatically detects missing MCP Server on startup
- **User Prompts**: "Run Setup Wizard" option when MCP Server not found
- **Command**: `winccoa.mcp.runSetup` for manual setup trigger
- **Progress Notifications**: Live progress updates during setup steps

### Changed
- `handleDetectionError` now offers "Run Setup Wizard" instead of "Setup Wizard (TODO)"
- Detection errors trigger async setup flow
- Setup wizard integrates with Project Admin Extension API

### Known Issues
- **Manager Package Resolution**: After setup, WinCC OA Manager may fail with `Cannot find package 'winccoa-manager'` error
  - Cause: Node module resolution in cloned repository
  - Workaround: Manual PMON configuration may be needed
  - Status: Investigating proper NODE_PATH configuration

### TODO
- Automatic PMON manager registration (requires Core Extension integration)

## [0.5.0] - 2026-01-13

### Added
- **Execute Script Tool**: New Language Model Tool `winccoa_execute_script` for executing CTL scripts via Script Actions extension
- Integration with WinCC OA Script Actions extension
- Script file search in workspace
- Support for script arguments

### Changed
- Tool count increased from 5 to 6

## [0.4.0] - 2026-01-13

### Added
- **Auto-Detection:** Read MCP config from project `.env` file (token, port, authType)
- **Project Admin Integration:** Automatic project detection and config loading
- **Project Change Events:** Auto-reconnect when project switches in Project Admin
- **Copilot-style Panel UI:** Click status bar opens panel at bottom (like GitHub Copilot)
  - Connection status with live updates
  - Project name, server URL, and tool count
  - Action buttons: Test Connection, Reconnect, Settings, Logs
- **Language Model Tools:** Always available (lazy client loading pattern)
- **Status Bar:** Renamed to "WinCC OA Copilot" with magic wand icon ($(wand))

### Fixed
- **Security:** Removed hardcoded token from public repository
- **UX:** No more notification spam for "no project selected" (only logs + red icon)
- **Tools Availability:** Tools now registered at startup (always visible to Copilot)

### Changed
- Error handling improved with 5 specific scenarios
- Config detection with caching and invalidation on project change

## [0.3.0] - 2026-01-13

### Fixed
- **Critical:** `get-datapoints` tool used wrong parameter name (`pattern` instead of `dpNamePattern`)
- **Critical:** Multiple datapoint results were ignored (only first result was returned)
- Datapoint search now correctly finds all matching datapoints

### Added
- TEST_PROMPTS.md: Comprehensive test scenarios for manual testing

## [0.2.0] - 2025-12-28

### Added
- **MCP Server Management Foundation**
  - MCPServerInstaller: Git clone + npm install automation
  - MCPConfigManager: .env file generation and config/progs management
  - MCPManagerControl: PMON integration (placeholder)
  - Public API for Core Extension integration
- **Commands**
  - `winccoa.mcp.setup` - Setup wizard (placeholder)
  - `winccoa.mcp.start/stop/restart` - Manager control
  - `winccoa.mcp.showLogs` - Output channel
  - `winccoa.mcp.diagnostics` - Diagnostics view (placeholder)
  - `winccoa.mcp.updateConfig` - Config editor (placeholder)
  - `winccoa.mcp.generateToken` - Secure token generator
- **Test Infrastructure**
  - Unit tests for token generation and tool configurations
  - Integration test structure with real WinCC OA test project
  - Test documentation with safety warnings

### Dependencies
- simple-git for repository cloning
- sinon, chai for testing
- @modelcontextprotocol/sdk ready for future use

### Notes
- Foundation complete, Wizard and Health Check coming in next version
- Integration tests need VS Code Extension Host (will run via make test-local)

## [0.1.0] - 2025-12-28

### Added
- Initial repository setup
- Package structure and configuration
- README with project motivation
- Basic project scaffolding

### Notes
- ⚠️ Pre-release version - no functional features yet
- Repository initialized with Git Flow (main/develop)
- Part of WinCC OA Tools Pack ecosystem

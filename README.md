# WinCC OA MCP Server

<div align="center">

![Version](https://img.shields.io/badge/version-1.6.2-blue.svg)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![VS Code](https://img.shields.io/badge/VS%20Code-1.108.0-007ACC.svg)

**Model Context Protocol server for WinCC OA - enables AI assistants to interact with WinCC OA projects**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Known Issues](#-known-issues)

</div>

---

> **⚠️ EXPERIMENTAL - Preview Release**
> 
> This extension is in **experimental/preview** state. Features may change, break, or be incomplete.
> 
> **Known Limitations:**
> - Not all MCP Server features are available when using the **npm package installation method**
> - Some tools (e.g., Modbus, advanced datapoint operations) require the **Git installation method**
> - If you encounter missing tools or errors, switch to Git installation in settings: `"winccoa.mcp.installMethod": "git"`
> 
> **Tip:** If the extension doesn't work as expected, try `Ctrl+Shift+P` → `Reload Window` to refresh.

---

## 🎯 Motivation

This extension provides a **Model Context Protocol (MCP) Server** for WinCC OA, acting as a bridge between AI assistants (like GitHub Copilot) and your WinCC OA projects.

**Note**: This extension uses the officially provided [WinCC OA MCP Webserver](https://github.com/winccoa/winccoa-ae-js-mcpserver) interface developed by Siemens. The extension automates the installation, configuration, and integration of this official webserver into your VS Code workflow.

The goal is to enable developers to use natural language commands to:

- 🔍 Search and query datapoints
- 📊 List and monitor managers
- 📈 Get datapoint values and types
- ✅ Check manager status
- 🗂️ Analyze WinCC OA project structure
- ⚡ Execute CTL scripts

---

## 🎬 See It In Action

![WinCC OA MCP Server Demo](https://github.com/winccoa-tools-pack/vscode-winccoa-mcp-server/blob/develop/resources/Animation.gif?raw=true)

---

## ✨ Features

### 🧙 Auto-Setup Wizard

- **One-Click Installation**: Automatically clones, installs, and configures MCP Server
- **Smart Manager Installation**: Post-setup dialog for WinCC OA manager configuration
  - **Automatic Mode**: Writes manager to `config/progs` file with auto-assigned number
  - **Manual Mode**: Shows comprehensive setup instructions
- **Auto-Number Assignment**: Finds next free `-num X` number automatically
- **Restart Reminder**: Clear instructions about project restart requirements

### 🔌 Persistent Client Architecture

- **Auto-Detection**: Reads MCP configuration from project's `.env` file
- **Auto-Connect**: Connects to MCP Server on extension activation
- **Auto-Reconnect**: Monitors connection with configurable heartbeat
- **Project Integration**: Seamless switching between WinCC OA projects

### 🤖 Language Model Tools

**6 tools available for GitHub Copilot autonomous access:**

- `list_managers` - List all WinCC OA managers with status
- `search_datapoints` - Search datapoints by pattern
- `get_datapoint_value` - Get current datapoint values
- `get_datapoint_type` - Get datapoint type information
- `get_manager_status` - Get detailed manager status
- `execute_script` - Execute CTL scripts with arguments

### ⚙️ User Settings

Configurable options in VS Code Settings:

- **Log Level**: Filter log output (debug, info, warn, error)
- **Auto-Reconnect**: Enable/disable automatic reconnection (default: true)
- **Reconnect Retries**: Configure retry attempts 0-10 (default: 3)
- **Heartbeat Interval**: Configure heartbeat check frequency 5s-5min (default: 30s)
- **Show Notifications**: Toggle reconnect notifications (default: true)

### 📊 Status Bar UI

- **Connection Status**: Live indicator (🪄 Connected / ⚠️ Disconnected)
- **QuickPick Menu**: Click status bar for context-aware actions
  - **Connected**: Show Server Info, Disconnect, Reconnect, Show Logs
  - **Disconnected**: Connect, Run Setup, Show Logs

---

## 📥 Installation

### Prerequisites

- **WinCC OA Project Admin Extension** (required for automatic project detection)
- **WinCC OA 3.21+** (officially supported version)
- **Node.js 14+** (for MCP Server runtime)

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "WinCC OA MCP Server"
4. Click "Install"

---

## 🚀 Setup

### Automatic Setup (Recommended)

1. **Install Extensions**:
   - Install **WinCC OA MCP Server** extension
   - Install **WinCC OA Project Admin** extension (dependency)

2. **Select Project**:
   - Open WinCC OA Project Admin view
   - Select your project from the list

3. **Run Setup Wizard**:
   - If MCP Server not found, extension prompts: "Run Setup Wizard"
   - Click "Install" to start automatic installation
   - Wait for progress: Clone → Install → Generate Token → Configure → Build

4. **Add Manager** (v1.1.0):
   - After installation, dialog appears: "Add MCP Server manager?"
   - Choose **Automatic** or **Manual Instructions**

   **Automatic Mode:**
   - Extension writes manager to `config/progs` file
   - Auto-assigns next free manager number
   - Shows restart reminder

   **Manual Mode:**
   - Webview panel with comprehensive instructions
   - Two setup options:
     - **Option 1 (Recommended)**: Via PMON Console
     - **Option 2**: Direct `config/progs` file editing
   - Copy-ready manager options string

5. **Restart WinCC OA Project**:
   - ⚠️ **IMPORTANT**: Close and reopen your WinCC OA project
   - Manager will appear in PMON Console
   - Manager starts automatically (start mode: always, 3 retries)

6. **Verify Connection**:
   - Check status bar: Should show "🪄 WinCC OA Copilot"
   - Click status bar → "Show Server Info" to verify

### Manual Setup

If auto-setup fails or you prefer manual installation:

<details>
<summary>Click to expand manual setup steps</summary>

1. **Clone MCP Server repository**:
   ```bash
   cd <your-project>/javascript
   git clone https://github.com/winccoa/winccoa-ae-js-mcpserver.git mcpServer
   ```

2. **Install dependencies and build**:
   ```bash
   cd mcpServer/mcpWinCCOA
   npm install
   npm run build
   ```

3. **Create `.env` file** in `mcpWinCCOA/build/.env`:
   ```env
   MCP_API_TOKEN=your-secure-token-here
   MCP_MODE=http
   MCP_HTTP_PORT=3001
   MCP_HTTP_HOST=0.0.0.0
   MCP_AUTH_TYPE=bearer
   RATE_LIMIT_ENABLED=true
   MCP_CORS_ENABLED=true
   MCP_CORS_ORIGINS=*
   WINCCOA_FIELD=default
   TOOLS=datapoints/dp_basic,datapoints/dp_create,datapoints/dp_set,manager/manager_list,archive/archive_query
   ```

4. **Add manager to PMON**:
   
   **Option 1 - Via PMON Console** (Recommended):
   - Open PMON Console
   - Click "Add Manager"
   - Configure:
     - Component: `node`
     - Start Mode: `always`
     - Seconds to Kill: `30`
     - Restart Count: `3`
     - Reset Min: `1`
     - Options: `-num 2 mcpServer /path/to/mcpWinCCOA/build/index_http.js`

   **Option 2 - Edit config/progs**:
   - Open `<project>/config/progs`
   - Add this line (before comments):
     ```
     node             | always |      30 |        3 |        1 |-num 2 mcpServer /path/to/mcpWinCCOA/build/index_http.js
     ```
   - Save file and restart WinCC OA project

5. **Restart WinCC OA Project**

</details>

---

## 💡 Usage

### With GitHub Copilot

Use natural language to interact with your WinCC OA project:

```
"Show me all datapoints with 'pump' in the name"
"What's the current value of System1:Tank.level?"
"List all running managers"
"Get the type information for ExampleDP_Arg1"
"Execute the test script in scripts/tests/myTest.ctl"
```

### Status Bar Menu

Click "🪄 WinCC OA Copilot" in the status bar to access:

**When Connected:**
- 📊 **Show Server Info**: View project, URL, and available tools
- 🔌 **Disconnect**: Close connection to MCP Server
- 🔄 **Reconnect**: Reconnect to server
- 📋 **Show Logs**: Open extension output channel

**When Disconnected:**
- 🔌 **Connect**: Connect to MCP Server
- 🛠️ **Run Setup**: Start MCP Server installation wizard
- 📋 **Show Logs**: Open extension output channel

### Commands

Available via Command Palette (`Ctrl+Shift+P`):

- `WinCC OA: Connect to MCP Server`
- `WinCC OA: Disconnect from MCP Server`
- `WinCC OA: Reconnect to MCP Server`
- `WinCC OA: Show Server Info`
- `WinCC OA: Run Setup Wizard`
- `WinCC OA: Show Logs`

---

## ⚙️ Configuration

### Essential Settings

| Setting                             | Default | Description                                              |
| ----------------------------------- | ------- | -------------------------------------------------------- |
| `winccoa.mcp.logLevel`              | `info`  | Log verbosity: `debug`, `info`, `warn`, `error`          |
| `winccoa.mcp.autoReconnect`         | `true`  | Enable automatic reconnection on connection loss         |
| `winccoa.mcp.reconnectRetries`      | `3`     | Number of retry attempts (0-10)                          |
| `winccoa.mcp.heartbeatInterval`     | `30000` | Heartbeat check interval in ms (5000-300000)             |
| `winccoa.mcp.showNotifications`     | `true`  | Show notifications for reconnect events                  |

💡 **Tip**: Set log level to `debug` when reporting bugs for detailed diagnostics.

---

## 🐛 Known Issues

### Manager Installation

1. **Project Restart Required**:
   - After adding MCP Server manager, the WinCC OA project **must be restarted**
   - Manager will not appear in PMON until restart
   - This is a WinCC OA limitation - `config/progs` is only read at startup

2. **WinCC OA Complete Restart Sometimes Needed**:
   - ⚠️ **Known Issue**: Sometimes a simple project restart is not enough
   - **Symptom**: Manager does not appear in PMON Console even after project restart
   - **Workaround**: Close WinCC OA completely and reopen it
   - **Root Cause**: WinCC OA caching issue with PMON configuration
   - **Recommendation**: If manager doesn't appear after first restart, close and reopen WinCC OA

### Connection & Auto-Reconnect

1. **Initial Connection Delay**:
   - First connection after project start may take 2-3 seconds
   - MCP Server needs time to initialize Node.js manager

2. **Auto-Reconnect Notifications**:
   - Can be disabled in settings: `winccoa.mcp.showNotifications`
   - Notifications appear during temporary connection loss (e.g., server restart)

---

## 🔧 Troubleshooting

### Manager Not Appearing

**Symptom**: Manager not visible in PMON Console after restart

**Solution**:
1. Restart WinCC OA project again
2. If still not visible: **Close WinCC OA completely and reopen**
3. Verify entry in `<project>/config/progs` file
4. Check manager number is unique (no conflicts with existing managers)

### Connection Failed

**Symptom**: Status bar shows "⚠️ WinCC OA Copilot" (red/yellow)

**Solution**:
1. Check MCP Server manager is running in PMON
2. Verify `.env` file exists: `<project>/javascript/mcpServer/mcpWinCCOA/build/.env`
3. Check port 3001 is not blocked by firewall
4. Check logs: Click status bar → "Show Logs"

### Setup Wizard Fails

**Symptom**: Installation errors during setup wizard

**Solution**:
1. Check Node.js is installed: `node --version`
2. Check Git is installed: `git --version`
3. Check internet connection (for git clone and npm install)
4. Try manual setup (see [Manual Setup](#manual-setup))

---

## 📚 Requirements

- **VS Code**: 1.108.0 or higher
- **WinCC OA**: 3.21 or higher (officially supported)
- **Node.js**: 14 or higher (for MCP Server runtime)
- **WinCC OA Project Admin Extension**: Required for automatic project detection

---

## � License

MIT © Richard Janisch - See [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- WinCC OA development team for the MCP Server implementation
- GitHub Copilot team for Language Model Tools API
- VS Code extension development community

# Test Prompts for WinCC OA MCP Tools

## 🧪 Test scenarios for Copilot Chat

These prompts help validate that Copilot can use the WinCC OA MCP tools via VS Code's MCP integration.

No special chat participant prefix (like `@winccoa`) is required.

---

## ✅ Tool 1: winccoa_list_managers

### German
```
Wie viele Manager laufen gerade?
```
```
Zeig mir alle WinCC OA Manager
```
```
Welche Prozesse sind aktiv?
```
```
Liste alle Manager mit Status auf
```

### English
```
How many managers are running?
```
```
Show me all WinCC OA managers
```
```
Which processes are active?
```
```
List all managers with their status
```

**Expected behavior:**
- Tool `winccoa_list_managers` is called
- Copilot shows manager count and status
- Response includes: name, status (running/stopped), PID

---

## 🔍 Tool 2: winccoa_get_datapoints

### German
```
Finde alle Datapoints die "Example" im Namen haben
```
```
Such nach Datapoints mit dem Pattern System1:*
```
```
Zeig mir alle Pump Datapoints
```
```
Liste alle Datapoints im System auf
```

### English
```
Find all datapoints containing "Example"
```
```
Search for datapoints matching System1:*
```
```
Show me all Pump datapoints
```
```
List all datapoints in the system
```

**Expected behavior:**
- Tool `winccoa_get_datapoints` is called
- Pattern is passed correctly (including wildcards if needed)
- Copilot shows the list of found datapoints
- Max 20 results shown (+ "... and X more")

**Known issue:**
- The MCP server may not find some datapoints (e.g. `sentron_3wa_01`)
- This is an MCP server issue, not an extension issue

---

## 📈 Tool 3: winccoa_get_value

### German
```
Was ist der aktuelle Wert von ExampleDP_Arg1.?
```
```
Lies den Wert von System1:Pump.state
```
```
Zeig mir den Wert des Datapoints ExampleDP_Arg1.
```
```
Welchen Wert hat ExampleDP_Arg1. gerade?
```

### English
```
What is the current value of ExampleDP_Arg1.?
```
```
Read the value of System1:Pump.state
```
```
Show me the value of datapoint ExampleDP_Arg1.
```
```
Get current value of ExampleDP_Arg1.
```

**Expected behavior:**
- Tool `winccoa_get_value` is called
- Copilot shows current value + timestamp
- If the datapoint ends with `.`, all elements are read
- If a specific element is provided, only that element is read

---

## 🏗️ Tool 4: winccoa_get_dptypes

### German
```
Liste alle Datapoint Typen auf
```
```
Zeig mir die verfügbaren DpTypes
```
```
Welche Typdefinitionen gibt es?
```
```
Find DpTypes matching *Motor*
```

### English
```
List all datapoint types
```
```
Show me available DpTypes
```
```
What type definitions exist?
```
```
Find DpTypes matching *Motor*
```

**Expected behavior:**
- Tool `winccoa_get_dptypes` is called
- Copilot shows the list of types
- Optionally includes elements/structure
- Max 20 results

---

## ℹ️ Tool 5: winccoa_get_manager_status

### German
```
Zeig mir Details zum REMUS Manager
```
```
Was ist der Status vom WCCOActrl Manager?
```
```
Gib mir Infos über den dist Manager
```

### English
```
Show me details for REMUS manager
```
```
What is the status of WCCOActrl manager?
```
```
Give me info about the dist manager
```

**Expected behavior:**
- Tool `winccoa_get_manager_status` is called
- Copilot shows details: name, PID, status, start mode
- If the manager is not found: returns a useful error message

---

## 🔗 Combined queries (multi-tool)

### German
```
Zeig mir alle Manager und dann den Wert von ExampleDP_Arg1.
```
```
Wie viele Manager laufen und welche Datapoint Types gibt es?
```
```
Liste alle Pump Datapoints auf und lies den Wert vom ersten
```

### English
```
Show me all managers and then the value of ExampleDP_Arg1.
```
```
How many managers are running and what datapoint types exist?
```
```
List all Pump datapoints and read the value of the first one
```

**Expected behavior:**
- Copilot calls multiple tools sequentially
- Response combines information from both calls
- Order is logical

---

## ❌ Negative tests (should NOT work)

### Wrong tool choice
```
Was ist das Wetter heute?
```
→ No WinCC OA tool is applicable

```
Erstelle einen neuen Datapoint
```
→ No create/write tool available (read-only)

### Missing parameters
```
Lies den Wert
```
→ Which datapoint? Copilot should ask a follow-up question

```
Such nach Datapoints
```
→ Which pattern? Copilot might default to `*`

---

## 🎯 Success metrics

**Tool is chosen correctly:**
- ✅ Copilot identifies the correct tool
- ✅ Pattern/parameters are extracted correctly
- ✅ German and English prompts behave similarly

**Tool is NOT chosen:**
- ⚠️ Copilot does not use a tool even though one is available
- ⚠️ Copilot chooses the wrong tool
- ⚠️ Parameters are missing or incorrect

**Error handling:**
- ✅ Copilot shows a meaningful error message
- ✅ User gets a clear next step
- ✅ On timeout: suggests retry or how to clear the error

---

## 📝 Notes for testing

1. **Enable logging:**
   - VS Code Output panel: select "WinCC OA MCP Server" (or similarly named channel)
   - Logs show: tool calls, parameters, responses

2. **MCP server must be running:**
   - Check the status bar: connected indicator
   - If disconnected: open the status bar menu and view logs / reconnect

3. **Rate limits:**
   - If too many requests: "Upstream provider rate limit hit"
   - Wait 1-2 minutes, then retry

4. **Consistency check:**
   - Run the same prompt multiple times
   - Results should be consistent (within expected runtime state changes)

---

## 🐛 Known issues

1. **Datapoint not found:**
   - MCP server issue, not the extension
   - Workaround: use the full name including system prefix

2. **Tool not chosen:**
   - Prompt too generic ("show something")
   - Solution: be more specific ("list managers")

3. **German performs worse:**
   - Some models perform best in English
   - Add English keywords to the prompt if needed

---

## ✅ Full test checklist

- [ ] Alle 5 Tools einzeln getestet (DE + EN)
- [ ] Multi-Tool Abfragen funktionieren
- [ ] Negative Tests schlagen fehl (korrekt)
- [ ] Fehlerbehandlung zeigt sinnvolle Messages
- [ ] Logs zeigen Tool-Calls korrekt
- [ ] Rate Limits werden respektiert
- [ ] MCP Server Connection stabil


# Test Prompts for WinCC OA MCP Tools

## 🧪 Test scenarios for Copilot Chat

These prompts help validate that Copilot can use the WinCC OA MCP tools via VS Code's MCP integration.

No special chat participant prefix (like `@winccoa`) is required.

---

## ✅ Tool 1: winccoa_list_managers

### Deutsch
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

**Erwartetes Verhalten:**
- Tool `winccoa_list_managers` wird aufgerufen
- Copilot zeigt Anzahl und Status der Manager
- Antwort enthält: Name, Status (running/stopped), PID

---

## 🔍 Tool 2: winccoa_get_datapoints

### Deutsch
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

**Erwartetes Verhalten:**
- Tool `winccoa_get_datapoints` wird aufgerufen
- Pattern wird korrekt übergeben (ggf. mit Wildcards)
- Copilot zeigt Liste der gefundenen Datapoints
- Max 20 Ergebnisse angezeigt (+ "... and X more")

**Bekanntes Problem:**
- MCP Server findet manche Datapoints nicht (z.B. `sentron_3wa_01`)
- Das ist ein MCP Server Problem, nicht Extension!

---

## 📈 Tool 3: winccoa_get_value

### Deutsch
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

**Erwartetes Verhalten:**
- Tool `winccoa_get_value` wird aufgerufen
- Copilot zeigt aktuellen Wert + Timestamp
- Bei `.` am Ende: Alle Elemente werden gelesen
- Bei spezifischem Element: Nur dieses Element

---

## 🏗️ Tool 4: winccoa_get_dptypes

### Deutsch
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

**Erwartetes Verhalten:**
- Tool `winccoa_get_dptypes` wird aufgerufen
- Copilot zeigt Liste der Typen
- Optional mit Elementen/Struktur
- Max 20 Ergebnisse

---

## ℹ️ Tool 5: winccoa_get_manager_status

### Deutsch
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

**Erwartetes Verhalten:**
- Tool `winccoa_get_manager_status` wird aufgerufen
- Copilot zeigt Details: Name, PID, Status, Start Mode
- Bei nicht gefundenem Manager: Error Message

---

## 🔗 Kombinierte Abfragen (Multi-Tool)

### Deutsch
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

**Erwartetes Verhalten:**
- Copilot ruft mehrere Tools nacheinander auf
- Antwort kombiniert Informationen aus beiden Calls
- Reihenfolge logisch

---

## ❌ Negative Tests (sollten NICHT funktionieren)

### Falsche Tool-Wahl
```
Was ist das Wetter heute?
```
→ Kein WinCC OA Tool verfügbar

```
Erstelle einen neuen Datapoint
```
→ Kein create/write Tool verfügbar (read-only!)

### Fehlende Parameter
```
Lies den Wert
```
→ Welcher Datapoint? LLM sollte nachfragen

```
Such nach Datapoints
```
→ Welches Pattern? LLM könnte `*` verwenden

---

## 🎯 Erfolgsmetriken

**Tool wird korrekt gewählt:**
- ✅ Copilot identifiziert richtiges Tool
- ✅ Pattern/Parameter werden korrekt extrahiert
- ✅ Deutsch & Englisch funktionieren gleich gut

**Tool wird NICHT gewählt:**
- ⚠️ LLM erkennt Tool nicht (obwohl verfügbar)
- ⚠️ LLM wählt falsches Tool
- ⚠️ Parameter fehlen oder falsch

**Fehlerbehandlung:**
- ✅ Copilot zeigt sinnvolle Fehlermeldung
- ✅ User bekommt Hinweis was zu tun ist
- ✅ Bei Timeout: Retry oder Clear Error

---

## 📝 Notizen für Tests

1. **Logging aktivieren:**
   - VS Code Output Panel: "WinCC OA MCP Server Extension"
   - Logs zeigen: Tool-Calls, Parameter, Responses

2. **MCP Server muss laufen:**
   - Check Status Bar: ✅ Grünes Icon
   - Falls ❌ Rot: `@winccoa /help` → sollte Fehler zeigen

3. **Rate Limits:**
   - Bei zu vielen Requests: "Upstream provider rate limit hit"
   - Warten 1-2 Minuten, dann retry

4. **Vergleich:**
   - Test gleichen Prompt MIT `@winccoa /command` (manual)
   - Vergleiche Ergebnisse: Sollten identisch sein

---

## 🐛 Bekannte Probleme

1. **Datapoint nicht gefunden:**
   - MCP Server Problem, nicht Extension
   - Workaround: Vollständigen Namen mit System angeben

2. **Tool wird nicht gewählt:**
   - Prompt zu generisch ("zeig was")
   - Lösung: Spezifischer formulieren ("zeig Manager")

3. **Deutsch funktioniert schlechter:**
   - LLM ist auf Englisch trainiert
   - Englische Keywords hinzufügen in Prompt

---

## ✅ Checkliste für kompletten Test

- [ ] Alle 5 Tools einzeln getestet (DE + EN)
- [ ] Multi-Tool Abfragen funktionieren
- [ ] Negative Tests schlagen fehl (korrekt)
- [ ] Fehlerbehandlung zeigt sinnvolle Messages
- [ ] Logs zeigen Tool-Calls korrekt
- [ ] Vergleich mit `@winccoa /command` identisch
- [ ] Rate Limits werden respektiert
- [ ] MCP Server Connection stabil


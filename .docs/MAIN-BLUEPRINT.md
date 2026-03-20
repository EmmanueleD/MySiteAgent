# Master Blueprint: Astro AI Design-System Agent

## 1. Visione e Obiettivi

MySiteAgent è un pannello admin AI embeddato in siti Astro, accessibile dalla rotta `/ai-admin`.
Permette a **content manager non tecnici** di modificare il sito tramite linguaggio naturale: l'agente traduce la richiesta in una Pull Request coerente con il Design System, mostra un'anteprima visiva, e applica la modifica solo dopo l'approvazione esplicita dell'utente.

**Modello di deployment**: il sistema viene installato su ogni sito Astro venduto a terzi. Ogni installazione è indipendente, con le proprie credenziali e il proprio contesto.

---

## 2. Vincoli Tecnici e Design System

### 2.1 Styling & Tokens

**Single Source of Truth**

Tutti i valori (colori, spacing, font, radius, ecc.) risiedono in `src/styles/tokens.css` come variabili CSS:

```css
:root {
  --color-primary: #0f172a;
  --color-secondary: #e11d48;
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --radius-md: 0.5rem;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

**Tailwind Mapping (opzionale)**

Se Tailwind è utilizzato, la configurazione deve mappare le utility direttamente sulle variabili CSS (es. `primary: "var(--color-primary)"`, `space-md: "var(--spacing-md)"`).
L'agente può usare solo classi Tailwind mappate ai token nella config (es. `bg-primary`, `text-accent`), non classi di default come `text-red-500` se non rimappate.

**No Hardcoding**

L'agente ha il divieto assoluto di usare valori esadecimali, RGB o pixel arbitrari (`#f3f3f3`, `rgb(0,0,0)`, `15px`, ecc.).
Deve usare esclusivamente:

- variabili CSS definite in `tokens.css` (es. `var(--color-primary)`, `var(--spacing-md)`), oppure
- classi Tailwind che puntano ai token.

---

### 2.2 Componenti & Specs

Ogni componente in `src/components/` deve avere una specifica in `src/components/specs/[Nome].md`.

La specifica definisce:

- scopo del componente;
- props/slot ammessi (con tipi/valori consentiti);
- varianti (`variant="primary" | "secondary"` ecc.);
- esempi d'uso corretti.

L'agente deve recuperare la specifica tramite Engram prima di usare o modificare qualsiasi componente.

L'agente **non può inventare**:

- nuove props non documentate,
- nuove varianti non presenti nella spec,
- nuovi componenti senza creare/aggiornare anche la relativa spec (solo se esplicitamente richiesto).

---

### 2.3 Design Quality (impeccable.style)

Il repo target include un file `.impeccable.md` che fornisce all'agente vocabolario e principi di design strutturati: tipografia, spacing ritmico, gerarchia visiva, anti-pattern.

Questo file viene caricato in Engram durante il setup e interrogato ad ogni richiesta, estendendo le capacità del solo `docs/design-system.md` con principi qualitativi concreti.

Installazione: `npx skills add pbakaus/impeccable`

---

## 3. Architettura del Sistema

### 3.1 Flusso Completo

```
Content manager → /ai-admin (Web UI)
      ↓
[Orchestrator — Astro API route con autenticazione]
      ↓
[Context Loading via Engram MCP]
  - query: componenti rilevanti alla richiesta
  - query: token CSS coinvolti
  - query: principi design (.impeccable.md)
  → inietta solo il contesto pertinente (~3% dei token totali)
      ↓
[Claude API — Tool Use nativo]
  - read_file     → legge il contenuto attuale dei file
  - write_file    → prepara le modifiche
  - query_context → interroga Engram on-demand durante l'elaborazione
      ↓
[Guardian — inline, intercetta ogni write_file]
  - audit: nessun valore hardcoded (#hex, rgb, px arbitrari)
  - AST: nessun eval(), fetch() verso URL esterni, script injection
  - design: verifica rispetto alle spec dei componenti usati
      ↓
[Executor — GitHub API]
  - crea branch con nome univoco (slug + timestamp)
  - committa i file modificati
  - apre la Pull Request
      ↓
[Hosting provider genera Deploy Preview URL automaticamente]
      ↓
[UI mostra all'utente]
  "Ecco l'anteprima delle modifiche →" [link preview]
  [Approva]  [Annulla]
      ↓
[Merge automatico via GitHub API dopo approvazione]
```

---

### 3.2 Agenti Specializzati (ispirato a agent-teams-lite)

| Agente | Responsabilità |
|---|---|
| **Planner** | Analizza la richiesta, identifica pagine/componenti/contenuti coinvolti |
| **Coder** | Genera le modifiche tramite tool use (read → write), rispettando token e spec |
| **Guardian** | Valida ogni `write_file`: niente hardcoded, niente codice pericoloso, spec rispettate |
| **Executor** | Crea branch, committa, apre PR, aspetta la deploy preview, gestisce il merge |

Nell'MVP un unico servizio orchestratore ricopre tutti i ruoli. La separazione avviene progressivamente nelle fasi successive.

---

## 4. Protocollo di Comunicazione LLM — Tool Use

L'agente utilizza il **Tool Use nativo di Claude API** (function calling), non output JSON da testo.

Questo garantisce affidabilità strutturale: Claude è addestrato a chiamare tool con parametri corretti, senza necessità di parsing manuale di JSON che può fallire su output malformato.

**Tool disponibili per l'agente:**

```ts
tools: [
  {
    name: "read_file",
    description: "Legge il contenuto attuale di un file nel repo",
    input_schema: {
      path: { type: "string" } // es. "src/pages/index.astro"
    }
  },
  {
    name: "write_file",
    description: "Scrive il contenuto aggiornato di un file (sempre completo, mai diff)",
    input_schema: {
      path:    { type: "string" },
      content: { type: "string" },
      action:  { type: "string", enum: ["create", "modify", "delete"] }
    }
  },
  {
    name: "create_branch",
    description: "Crea un branch Git con nome univoco",
    input_schema: {
      name: { type: "string" } // es. "ai-update/add-summer-banner-1748123456"
    }
  },
  {
    name: "create_pr",
    description: "Apre una Pull Request su GitHub",
    input_schema: {
      branch: { type: "string" },
      title:  { type: "string" },
      body:   { type: "string" }
    }
  },
  {
    name: "query_context",
    description: "Interroga Engram per recuperare spec, token o principi di design rilevanti",
    input_schema: {
      query: { type: "string" } // es. "Hero component props and variants"
    }
  }
]
```

**Regole invarianti per il Coder:**

- Chiamare sempre `read_file` prima di `write_file` sullo stesso percorso.
- Il contenuto in `write_file` deve essere sempre il file completo, mai un diff o patch.
- Usare `query_context` ogni volta che non si è certi di spec o token disponibili.
- I nomi di branch devono essere in kebab-case inglese con timestamp: `ai-update/<slug>-<timestamp>`.

---

## 5. Gestione del Contesto — Engram

**Problema senza Engram**: ogni richiesta richiederebbe di inviare all'LLM tutto il design system (tokens.css + tutte le spec + docs + .impeccable.md). Su siti con 30+ componenti questo satura il context window e costa token inutilmente.

**Soluzione**: [Engram](https://github.com/Gentleman-Programming/engram) (Gentleman-Programming) — sistema di memoria persistente basato su SQLite + FTS5, disponibile come MCP server. Risparmio dichiarato: **96.6% di token in meno** rispetto all'iniezione completa del contesto.

### Ciclo di vita del contesto

| Momento | Azione |
|---|---|
| **Setup iniziale del sito** | Indicizzare in Engram: tutti i token CSS, tutte le spec dei componenti, principi `.impeccable.md`, struttura delle pagine |
| **Ogni richiesta utente** | Query a Engram per recuperare solo il contesto rilevante alla richiesta specifica |
| **Dopo ogni modifica** | Aggiornare Engram se un componente è stato creato o la sua spec è cambiata |

Engram si integra come MCP server: nessun middleware aggiuntivo, compatibile nativamente con Anthropic SDK.

---

## 6. Sicurezza

### 6.1 Autenticazione di /ai-admin

La rotta `/ai-admin` su un sito pubblico senza protezione è un vettore di attacco (costi LLM, PR non autorizzate). L'autenticazione è **obbligatoria dalla Fase 0**.

Requisiti minimi:
- Sessione protetta da password (o magic link via email)
- Rate limiting per IP
- Log di ogni richiesta (utente, timestamp, testo della richiesta, PR generata)

### 6.2 Validazione del codice generato (Guardian)

Il Guardian intercetta ogni `write_file` prima che venga committato:

- **Audit token**: nessun valore hex (`#xxxxxx`), `rgb(...)`, o `px` arbitrario
- **AST check**: nessun `eval()`, `Function()`, `fetch()` verso URL non appartenenti al sito, attributi `onXxx` inline
- **Spec check**: i componenti usati esistono e i loro props rispettano la specifica

Se una validazione fallisce, il Guardian restituisce l'errore al Coder con istruzioni di correzione prima di procedere.

### 6.3 Credenziali

Ogni installazione usa un proprio `.env` (mai committato):

```
GITHUB_TOKEN=...       # PAT con scope repo (o GitHub App token)
ANTHROPIC_API_KEY=...  # API key Claude
GITHUB_OWNER=...       # username o org del repo
GITHUB_REPO=...        # nome del repo
ADMIN_PASSWORD=...     # password per accesso a /ai-admin
```

In produzione multi-sito: preferire **GitHub App** (scoped al singolo repo, non legata a un account personale) rispetto al PAT.

---

## 7. Struttura del Repository Target

| Percorso | Descrizione |
|---|---|
| `/src/styles/tokens.css` | Single source of truth per tutti i valori di design |
| `/src/components/` | Componenti del layout (Hero, Section, Banner, ecc.) |
| `/src/components/specs/` | Specifiche di ogni componente (props, varianti, esempi) |
| `/src/content/` | Testi e contenuti separati dal layout (Markdown/MDX/JSON) |
| `/docs/design-system.md` | Panoramica del design system per l'LLM |
| `/.impeccable.md` | Principi e vocabolario di design per l'agente (da impeccable.style) |

---

## 8. Anteprima Visiva

L'utente non tecnico non vede mai una PR, un diff di codice, o un branch Git. Vede:

1. Un messaggio di avanzamento ("Sto analizzando la richiesta…", "Sto preparando le modifiche…")
2. Un link all'anteprima visiva del sito con le modifiche applicate
3. Due pulsanti: **Approva** e **Annulla**

**Implementazione**: le piattaforme di hosting (Netlify, Vercel, Cloudflare Pages) generano automaticamente una Deploy Preview URL per ogni PR aperta. Nessuna logica custom di screenshot è necessaria.

**Prerequisito di installazione**: il sito deve essere hostato su una piattaforma con deploy preview. Questo va comunicato come requisito al cliente.

**Fallback** (hosting senza preview): mostrare un sommario in linguaggio naturale delle modifiche (es. "Il titolo della hero cambierà in 'Benvenuti nel mio studio', il colore del pulsante passerà da blu a rosso").

---

## 9. Roadmap di Sviluppo

### Fase 0: Loop Locale con Tool Use + Engram

**Obiettivi:**

- Sito Astro minimo: 1 pagina (`src/pages/index.astro`), 1 componente `Hero`, `tokens.css` base, `.impeccable.md`.
- Setup Engram: indicizzare componenti e token al primo avvio.
- API route Astro `/api/agent` (con autenticazione base) che:
  - riceve la richiesta in linguaggio naturale,
  - interroga Engram per il contesto rilevante,
  - chiama Claude API con tool use,
  - intercetta ogni `write_file` con il Guardian,
  - applica le modifiche al filesystem locale.
- UI minima in `/ai-admin`: campo testo + pulsante + feedback di stato.

**Scopo:** chiudere il loop completo (richiesta → validazione → file scritti) senza ancora toccare GitHub.

---

### Fase 1: GitHub Integration & CI

**Obiettivi:**

- Attivare `create_branch` e `create_pr` nell'Executor (GitHub API via Octokit).
- Gestione branch univoci: `ai-update/<slug>-<unix-timestamp>`.
- Cron job GitHub Actions per cleanup branch orfani (creati ma PR mai aperta).
- Retry con exponential backoff per le chiamate GitHub API.
- `scripts/audit-tokens.js`: scansiona file modificati per valori hardcoded → esce con codice ≠ 0 se trovati.
- GitHub Actions CI su ogni PR: `npm ci` → `npm run lint` → `npm run build` → `node scripts/audit-tokens.js`.
- UI: mostrare il link alla Deploy Preview dopo la creazione della PR.

---

### Fase 2: UX e Robustezza

**Obiettivi:**

- Flusso Approva/Annulla: merge automatico via GitHub API dopo conferma utente.
- Fallback testuale per hosting senza deploy preview.
- Error handling completo:
  - LLM non risponde → messaggio human-friendly + retry automatico
  - Guardian blocca → spiegazione in linguaggio naturale di cosa non è possibile fare
  - GitHub API fallisce → rollback (chiudi PR e cancella branch orfano)
- Log strutturati per ogni richiesta (input, output, PR generata, esito).
- Aggiornamento automatico di Engram dopo ogni modifica andata a buon fine.

---

### Fase 3: Multi-Agent & Packaging

**Obiettivi:**

- Separazione esplicita degli agenti secondo il pattern `agent-teams-lite`:
  - Planner, Coder, Guardian, Executor come processi distinti con comunicazione definita.
- Creazione di un **Astro Integration** installabile (`astro add mysiteagent`) che:
  - aggiunge la rotta `/ai-admin`,
  - aggiunge la rotta `/api/agent`,
  - configura Engram,
  - legge il `.env` standard.
- Strategia di aggiornamento: versioning semantico del pacchetto, compatibile con Renovate/Dependabot.
- Test E2E del sistema agente (richiesta → PR → merge) con repo di test.

---

## 10. Istruzioni per l'Agente AI

Quando operi come agente su questo progetto:

**Recupera sempre il contesto prima di modificare**
Usa `query_context` per recuperare da Engram: spec del componente coinvolto, token rilevanti, eventuali principi di design applicabili. Non supporre — chiedi a Engram.

**Leggi prima di scrivere**
Chiama sempre `read_file` prima di `write_file` sullo stesso percorso. Il contenuto attuale del file è parte del contesto.

**Sii atomico**
Una PR per ogni richiesta logica. Se la richiesta tocca più aree indipendenti, concentrati sulla principale e segnala cosa resta fuori nel `body` della PR.

**Sii conservativo**
Se una richiesta viola il Design System (colori non definiti, props non documentate) o richiede un componente inesistente:
- non inventare codice fragile,
- spiega il limite in linguaggio semplice (l'utente è non tecnico),
- proponi un'alternativa realizzabile con i componenti e token disponibili.

**Integrità del codice**
- `write_file` contiene sempre il file completo, mai un frammento.
- Non omettere codice preesistente non coinvolto nella modifica.
- Mantieni stile, formattazione e convenzioni del progetto.

**Coerenza linguistica**
- Nomi di branch, componenti e variabili: `kebab-case` inglese.
- Testi visibili nel sito: nella lingua del sito (es. italiano).
- Messaggi all'utente nell'UI: sempre in linguaggio non tecnico.

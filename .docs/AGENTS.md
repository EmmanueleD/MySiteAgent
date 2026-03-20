# AGENTS.md — Istruzioni Operative degli Agenti

Questo documento definisce il contratto operativo di ciascun agente del sistema MySiteAgent.
Ogni agente ha ruolo, input, tool, output e regole decisionali distinti.
I system prompt runtime di ogni agente derivano direttamente da questo file.

---

## Panoramica del flusso

```
Utente (content manager)
      ↓ richiesta in linguaggio naturale
[Planner]  — analizza e valuta la fattibilità
      ↓ task breakdown strutturato
[Coder]    — genera le modifiche ai file via tool use
      ↓ ogni write_file viene intercettato
[Guardian] — valida il contenuto prima che venga applicato
      ↓ file approvati + metadata PR
[Executor] — crea branch, committa, apre PR su GitHub
      ↓ pr_url + preview_url
Utente     — vede l'anteprima, approva o annulla
```

---

## Agente 1: Planner

### Ruolo

Riceve la richiesta grezza dell'utente e la trasforma in un task strutturato che il Coder può eseguire.
**Non tocca mai il codice.** Si occupa esclusivamente di analisi e pianificazione.

### Input

```ts
{
  user_request: string  // es. "Cambia il titolo della hero in Benvenuto nel mio studio"
}
```

### Tool disponibili

| Tool | Utilizzo |
|---|---|
| `query_context` | Interroga Engram per verificare quali componenti, token e pagine esistono nel progetto |

### Output

```ts
{
  intent: string,              // descrizione breve dell'obiettivo (max 80 char)
  files_to_read: string[],     // file che il Coder deve leggere prima di modificare
  components_involved: string[], // componenti Astro coinvolti (per caricare le spec)
  tokens_likely_used: string[], // token CSS probabilmente necessari
  pr_title: string,            // titolo della PR (breve, significativo, in italiano)
  pr_body: string,             // descrizione per il revisore tecnico (non per l'utente)
  feasible: boolean,           // la richiesta è realizzabile con i vincoli attuali?
  rejection_reason?: string    // se feasible=false: spiegazione human-friendly (senza gergo tecnico)
}
```

### Regole decisionali

**Quando `feasible: false`:**
- La richiesta menziona colori, font o spacing non definiti in `tokens.css`
- La richiesta richiede un componente che non esiste in Engram
- La richiesta comporta modifiche strutturali al layout che romperebbero la gerarchia del Design System

**Quando `feasible: true` con avviso nel `pr_body`:**
- La richiesta tocca più di 3 aree indipendenti → pianificare solo la principale, segnalare il resto
- La richiesta è ambigua → scegliere l'interpretazione più conservativa e documentarla

**Mai:**
- Inventare token non presenti in `tokens.css`
- Assumere che un componente esista senza averlo verificato tramite `query_context`
- Restituire `feasible: true` se non si è certi che il Design System supporti la richiesta

### Gestione errori

| Scenario | Comportamento |
|---|---|
| Engram non risponde | Restituire `feasible: false` con messaggio "Impossibile verificare il design system al momento. Riprova tra qualche istante." |
| Richiesta completamente incomprensibile | Restituire `feasible: false` con messaggio "Non ho capito cosa modificare. Puoi descrivere la modifica in modo più specifico?" |

---

## Agente 2: Coder

### Ruolo

Genera le modifiche ai file del sito rispettando i vincoli del Design System.
**Non apre PR e non interagisce con GitHub.** Il suo output è una sequenza di tool call `write_file`.

### Input

```ts
{
  planner_output: PlannerOutput,  // task breakdown dal Planner
  engram_context: string          // contesto recuperato da Engram (spec + token rilevanti)
}
```

### Tool disponibili

| Tool | Utilizzo |
|---|---|
| `read_file` | Legge il contenuto attuale di un file prima di modificarlo |
| `write_file` | Scrive il contenuto aggiornato di un file (sempre completo) |
| `query_context` | Interroga Engram on-demand se servono ulteriori dettagli su spec o token |

### Output

Sequenza di chiamate `write_file`. Ogni chiamata ha la forma:

```ts
write_file({
  path: string,                         // percorso relativo dal root del repo
  content: string,                      // SEMPRE il file completo aggiornato
  action: "create" | "modify" | "delete"
})
```

Al termine di tutte le `write_file`, il Coder emette un sommario:

```ts
{
  summary_for_user: string,   // descrizione delle modifiche in linguaggio non tecnico (per l'utente)
  tokens_used: string[],      // token CSS effettivamente usati nelle modifiche
  notes_for_pr: string        // eventuali note per il PR body (cosa è stato lasciato fuori e perché)
}
```

### Regole invarianti

**Ordine obbligatorio:**
1. Chiamare `read_file` su ogni file prima di chiamare `write_file` sullo stesso percorso
2. Chiamare `query_context` se non si è certi di props, varianti o token disponibili
3. Chiamare `write_file` solo dopo aver letto il file attuale

**Contenuto di `write_file`:**
- Sempre il file **completo** — niente diff, niente `// ... resto invariato`, niente troncature
- Mantenere stile, indentazione e convenzioni del progetto esistente
- Non omettere import, export o sezioni preesistenti non coinvolte nella modifica

**Design System:**
- Nessun valore hardcoded: `#hex`, `rgb(...)`, `rgba(...)`, pixel arbitrari (`15px`, `24px`, ecc.)
- Usare esclusivamente variabili CSS da `tokens.css` (es. `var(--color-primary)`) o classi Tailwind mappate ai token
- Non inventare props non documentate nella spec del componente
- Non inventare varianti non presenti nella spec del componente

**Nomi branch** (passati al Coder come contesto, usati dall'Executor):
- Formato: `ai-update/<slug-kebab-inglese>-<unix-timestamp>`
- Esempio: `ai-update/change-hero-title-1748123456`

**In caso di dubbio tecnico:**
- Scegliere l'opzione più conservativa
- Documentare la scelta in `notes_for_pr`
- Non tentare soluzioni fragili solo per soddisfare la richiesta

### Gestione errori

| Scenario | Comportamento |
|---|---|
| `read_file` restituisce un file non esistente | Fermarsi, segnalare che il file indicato dal Planner non esiste, non procedere con `write_file` |
| Il file è troppo grande per essere restituito completamente | Segnalare il limite; non produrre un file troncato |
| Impossibile rispettare il Design System con i token disponibili | Fermarsi, spiegare il limite in `notes_for_pr`, lasciare `feasible: false` implicito nell'output |

---

## Agente 3: Guardian

### Ruolo

Intercetta ogni chiamata `write_file` del Coder e valida il contenuto **prima** che venga applicato al filesystem o inviato a GitHub.
È il gate di sicurezza inline del sistema. Non genera codice, non suggerisce alternative creative — valida e respinge.

### Input

```ts
{
  path: string,
  content: string,
  action: "create" | "modify" | "delete"
}
```

### Tool disponibili

Nessuno — il Guardian opera esclusivamente tramite analisi statica del contenuto ricevuto.

### Validazioni (eseguite in questo ordine)

**1. Token audit**
Nessuno dei seguenti pattern deve comparire nel contenuto:
- Valori esadecimali: `#[0-9a-fA-F]{3,8}` (inclusi shorthand come `#fff`)
- Funzioni colore: `rgb(`, `rgba(`, `hsl(`, `hsla(`
- Pixel arbitrari: valori numerici con `px` non provenienti da token (es. `margin: 15px`)
- Numeri magici: valori di spacing/sizing arbitrari inline negli stili

**2. AST / pattern check (sicurezza)**
Nessuno dei seguenti pattern deve comparire nel contenuto:
- `eval(` — esecuzione di codice arbitrario
- `new Function(` — costruzione di funzioni da stringa
- `innerHTML =` — rischio XSS via assegnazione diretta
- Attributi `on*` inline nel markup HTML/Astro (es. `onclick=`, `onload=`)
- `fetch(` o `axios(` verso URL non appartenenti al dominio del sito
- Import dinamici da URL esterni (`import('http...`)

**3. Spec check**
Per ogni componente Astro usato nel file:
- Il componente deve esistere in `src/components/`
- Le props passate devono essere documentate nella spec corrispondente in `src/components/specs/`
- Le varianti usate (`variant="..."`) devono essere presenti nella spec

**4. Completeness check**
Il contenuto non deve contenere:
- Placeholder espliciti: `// TODO`, `// ...`, `/* resto del codice */`, `[CONTINUA]`
- Testo troncato o frasi incomplete
- Import non risolti (riferimenti a file o moduli non esistenti nel repo)

### Output

```ts
// Approvazione
{ valid: true }

// Rifiuto
{
  valid: false,
  errors: string[],       // lista degli errori trovati (specifici, con riga/contesto se possibile)
  instructions: string    // istruzioni precise per il Coder su cosa correggere
}
```

### Limite di tentativi

- Il Coder può ricevere feedback dal Guardian e rigenerare il file al massimo **2 volte**
- Al **terzo fallimento**: l'intera richiesta viene annullata
- L'utente riceve: *"Non sono riuscito a completare questa modifica rispettando le regole del sito. Puoi provare con una richiesta diversa o contattare il tuo sviluppatore."*

### Gestione errori

| Scenario | Comportamento |
|---|---|
| Il file è un `delete` | Validare solo che il path sia un file esistente nel progetto; nessuna analisi del contenuto |
| Il file non è codice (es. `.md`, `.json`) | Applicare solo il completeness check; saltare token audit e AST check |

---

## Agente 4: Executor

### Ruolo

Prende i file validati dal Guardian e li applica su GitHub creando branch, commit e Pull Request.
Gestisce tutto il ciclo Git inclusa la gestione degli errori e la pulizia degli stati parziali.

### Input

```ts
{
  files: Array<{
    path: string,
    content: string,
    action: "create" | "modify" | "delete"
  }>,
  metadata: {
    intent: string,         // dal Planner
    pr_title: string,       // dal Planner
    pr_body: string,        // dal Planner + notes_for_pr del Coder
    summary_for_user: string // dal Coder (mostrato all'utente nell'UI)
  }
}
```

### Tool disponibili

| Tool | Utilizzo |
|---|---|
| `create_branch` | Crea un branch Git su GitHub |
| `create_pr` | Apre una Pull Request su GitHub |
| GitHub Contents API (Octokit) | Crea/aggiorna/cancella file nel branch |

### Sequenza operativa

```
1. Generare nome branch univoco
   → "ai-update/<slug-da-intent>-<Date.now()>"
   → es. "ai-update/change-hero-title-1748123456789"

2. Creare il branch da `main` via GitHub API

3. Per ogni file in `files`:
   → GET /repos/{owner}/{repo}/contents/{path}?ref={branch}  (legge SHA attuale se esiste)
   → PUT /repos/{owner}/{repo}/contents/{path}               (crea o aggiorna)
   → DELETE /repos/{owner}/{repo}/contents/{path}            (se action = "delete")

4. Aprire la Pull Request
   → title: metadata.pr_title
   → body: metadata.pr_body
   → head: nome branch creato
   → base: "main"

5. Attendere la Deploy Preview URL
   → polling ogni 5s per max 60s sul Check Run del hosting provider
   → se disponibile: restituire { pr_url, preview_url }
   → se non disponibile entro 60s: restituire { pr_url, preview_url: null }

6. Restituire all'UI:
   {
     pr_url: string,
     preview_url: string | null,
     summary_for_user: string   // passato direttamente dal Coder
   }
```

### Gestione errori

| Scenario | Comportamento |
|---|---|
| Nome branch già esistente | Aggiungere suffisso `Math.random().toString(36).slice(2,6)` e riprovare (max 2 tentativi) |
| GitHub API rate limit (HTTP 429) | Exponential backoff: 1s → 2s → 4s; max 3 tentativi; poi restituire errore human-friendly |
| Fallimento dopo creazione branch, prima della PR | Cancellare il branch orfano (`DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`), restituire errore |
| Fallimento su un file durante il commit (repo ha sub-path non esistente) | Creare i path intermedi mancanti prima di caricare il file |
| PR creata ma deploy preview non disponibile | Restituire `preview_url: null`; UI mostra solo il link PR con nota "L'anteprima non è disponibile, puoi verificare direttamente sulla PR" |
| Merge fallisce dopo approvazione utente | Segnalare conflitto; suggerire di aprire la PR su GitHub per la risoluzione manuale |

### Merge dopo approvazione utente

Quando l'utente preme "Approva" nell'UI:

```
PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge
  merge_method: "squash"
  commit_title: "{pr_title}"
  commit_message: "Generated by MySiteAgent\n\n{intent}"
```

Dopo il merge: cancellare il branch (`DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`).

---

## Convenzioni comuni a tutti gli agenti

### Linguaggio

| Contesto | Lingua |
|---|---|
| Messaggi visibili all'utente nell'UI | Italiano, senza gergo tecnico |
| Nomi di branch, slug, variabili, componenti | Inglese, kebab-case |
| PR title e body | Italiano (leggibile dal revisore tecnico) |
| Commenti nel codice generato | Inglese |

### Limiti operativi

- **Atomicità**: una richiesta = una PR. Se la richiesta ne implicherebbe due, gestire la principale e segnalare il resto.
- **Conservatorismo**: in caso di dubbio, rifiutare con spiegazione anziché produrre codice fragile.
- **Tracciabilità**: ogni PR deve contenere nel body i token CSS usati, i componenti toccati e il reasoning sintetico.

### Cosa gli agenti non possono mai fare

- Usare valori di design non presenti in `tokens.css`
- Accedere a URL esterni non appartenenti al dominio del sito target
- Modificare file fuori da `src/`, `public/` e `content/` senza esplicita istruzione nel task
- Cancellare `tokens.css`, `astro.config.mjs` o qualsiasi file di configurazione root
- Creare PR su branch diversi da `main` come base

# Page Spec: index

## Description

Home page principale del sito MySiteAgent. Presenta il componente Hero e una breve introduzione al servizio.

## Components Used

| Component | Props |
|-----------|-------|
| `Layout` | `title: string` |
| `Hero` | `title: string`, `subtitle?: string` |

## Structure

1. **Layout**: wrapper principale con titolo della pagina
2. **Hero**: sezione hero con titolo e sottotitolo
3. **Main**: contenuto principale con paragrafo introduttivo

## Content Guidelines

- Il titolo dell'Hero deve essere accogliente e descrivere il servizio
- Il sottotitolo spiega brevemente cosa fa MySiteAgent
- Il paragrafo principale invita l'utente ad accedere all'area admin

## Constraints

- Tutti i valori CSS devono usare token da `src/styles/tokens.css`
- Nessun colore hex hardcoded, valori px, o testo segnaposto
- Tutto il testo visibile deve essere in italiano

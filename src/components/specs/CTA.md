# CTA Component

## Descrizione
Componente di Call-to-Action con sezione di contatto principale per invitare gli utenti ad agire.

## Props

| Prop | Type | Default | Descrizione |
|------|------|---------|-------------|
| title | string | "Pronti a iniziare?" | Titolo principale della CTA |
| subtitle | string | "Contattaci per scoprire come possiamo aiutarti" | Sottotitolo descrittivo |
| phoneNumber | string | "3514590525" | Numero di telefono da contattare |
| phoneLabel | string | "Chiama ora" | Etichetta per il link telefonico |
| buttonLabel | string | "Invia un messaggio" | Etichetta per il pulsante secondario |
| buttonHref | string | "#contact" | Link del pulsante secondario |

## Utilizzo

```astro
<CTA
  title="Contattaci"
  subtitle="Siamo qui per aiutarti"
  phoneNumber="3514590525"
/>
```

## Design

- Background: Gradient primario con colore secondario
- Layout: Colonna su mobile, riga su desktop
- Responsive: Adattato a tutti i dispositivi
- Accessibilità: Link tel: per funzionalità nativa del dispositivo

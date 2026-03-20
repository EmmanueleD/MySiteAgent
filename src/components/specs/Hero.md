# Component Spec: Hero

## Props

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | The main heading text displayed in the hero section |
| `subtitle` | `string` | No | Optional descriptive text displayed below the title |

## Variants

### Default
Full-width section with centered content on a surface background. Contains a large heading and optional subtitle paragraph.

## Usage

```astro
<!-- Minimal usage (required props only) -->
<Hero title="Benvenuto nel futuro" />

<!-- With optional subtitle -->
<Hero
  title="Benvenuto nel futuro"
  subtitle="La piattaforma AI per gestire i contenuti del tuo sito Astro."
/>
```

## Constraints

- `title` MUST be a non-empty string. An empty title will render an empty `<h1>` element.
- All CSS values MUST use token variables from `src/styles/tokens.css` (e.g., `var(--color-foreground)`, `var(--space-2xl)`).
- No hardcoded hex colors, `rgb()`, `hsl()`, or pixel values are permitted.
- The `subtitle` prop is optional; when omitted, no `<p>` element is rendered.
- Text content must never be placeholder text (Lorem ipsum, [TODO], etc.).

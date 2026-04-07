import { AppError } from '../../../middleware/error-handler.js';

function toPathSegments(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getValueAtPath(source: unknown, path: string): unknown {
  const normalizedPath = path.trim().replace(/^\$\.?/, '').replace(/^variables\.?/, '');
  if (!normalizedPath) return source;

  let current: unknown = source;
  for (const segment of toPathSegments(normalizedPath)) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export async function executeTemplateRenderer(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const template = typeof input.template === 'string' ? input.template : '';
  const variables = (input.variables && typeof input.variables === 'object')
    ? (input.variables as Record<string, unknown>)
    : null;

  if (!template.trim()) {
    throw new AppError(400, 'INVALID_TEMPLATE', 'template must be a non-empty string');
  }
  if (!variables) {
    throw new AppError(400, 'INVALID_TEMPLATE_VARIABLES', 'variables must be an object');
  }

  const missingVariables = new Set<string>();
  const rendered = template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) => {
    const resolved = getValueAtPath(variables, rawPath);
    if (resolved === undefined) {
      missingVariables.add(rawPath.trim());
      return '';
    }
    return stringifyTemplateValue(resolved);
  });

  return {
    rendered,
    missing_variables: Array.from(missingVariables),
  };
}

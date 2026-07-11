import { vi } from 'vitest';

export function createFakeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'ilike', 'gte', 'lte', 'limit', 'single', 'maybeSingle', 'or', 'order', 'is'];
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  (builder as any).then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => resolve(result);
  return builder;
}

export function createFakeSupabase(results: Record<string, { data: unknown; error: unknown }>) {
  const builders: Record<string, ReturnType<typeof createFakeQueryBuilder>> = {};
  const from = vi.fn((table: string) => {
    builders[table] = builders[table] ?? createFakeQueryBuilder(results[table] ?? { data: null, error: null });
    return builders[table];
  });
  return { from, builders };
}

import type { FilterRule } from '../../types/listing';

function quoteIfNeeded(value: string): string {
  if (/[,."():\s]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function buildFilterString(rules: FilterRule[]): string | null {
  if (rules.length === 0) return null;

  const groups = new Map<number, FilterRule[]>();
  for (const rule of rules) {
    const list = groups.get(rule.rule_group) ?? [];
    list.push(rule);
    groups.set(rule.rule_group, list);
  }

  const groupStrings = Array.from(groups.values()).map((groupRules) => {
    const conditions = groupRules.map((r) => {
      if (r.operator === 'in') {
        const values = r.value.split(',').map((v) => v.trim()).filter(Boolean).join(',');
        return `${r.field}.in.(${values})`;
      }
      return `${r.field}.${r.operator}.${quoteIfNeeded(r.value)}`;
    });
    return conditions.length === 1 ? conditions[0] : `and(${conditions.join(',')})`;
  });

  return `or(${groupStrings.join(',')})`;
}

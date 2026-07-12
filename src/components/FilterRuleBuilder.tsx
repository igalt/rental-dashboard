'use client';

import { useEffect, useState } from 'react';
import type { FilterRule, RuleField, RuleOperator } from '../types/listing';

const FIELDS: RuleField[] = ['price', 'rooms', 'area', 'move_in_date'];
const OPERATORS: RuleOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'in'];

export function FilterRuleBuilder() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [field, setField] = useState<RuleField>('price');
  const [operator, setOperator] = useState<RuleOperator>('lt');
  const [value, setValue] = useState('');

  async function refresh() {
    const response = await fetch('/api/filter-rules');
    const body = await response.json();
    setRules(body.rules ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addRule() {
    if (!value.trim()) return;
    await fetch('/api/filter-rules', {
      method: 'POST',
      body: JSON.stringify({ field, operator, value, rule_group: 0 }),
    });
    setValue('');
    refresh();
  }

  async function removeRule(id: string) {
    await fetch(`/api/filter-rules?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="space-y-2 border rounded-lg p-4 bg-white dark:bg-neutral-900">
      <h2 className="font-semibold">Filter rules</h2>
      <ul className="space-y-1">
        {rules.map((rule) => (
          <li key={rule.id} className="flex justify-between text-sm items-center">
            <span>{rule.field} {rule.operator} {rule.value}</span>
            <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => removeRule(rule.id)}>Remove</button>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-gray-500">No rules yet — showing everything.</li>}
      </ul>
      <div className="flex gap-2 flex-wrap items-center pt-2">
        <select className="border rounded px-2 py-1 text-sm bg-transparent" value={field} onChange={(e) => setField(e.target.value as RuleField)}>
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm bg-transparent" value={operator} onChange={(e) => setOperator(e.target.value as RuleOperator)}>
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input className="border rounded px-2 py-1 text-sm flex-1 min-w-24 bg-transparent" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
        <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700" onClick={addRule}>Add rule</button>
      </div>
    </div>
  );
}

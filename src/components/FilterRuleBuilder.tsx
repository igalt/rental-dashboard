'use client';

import { useEffect, useState } from 'react';
import type { FilterRule, RuleField, RuleOperator } from '../types/listing';

const FIELDS: RuleField[] = [
  'price',
  'rooms',
  'area',
  'move_in_date',
  'listing_type',
  'status',
  'floor',
  'built_sqm',
  'condition',
  'safe_room',
  'balcony',
  'storage',
  'furnished',
];
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
    <div className="bg-paper-raised border border-rule rounded-sm p-5 shadow-[3px_3px_0_0_var(--rule)]">
      <h2 className="font-mono text-xs tracking-[0.15em] uppercase text-ink-soft mb-3">Filter rules</h2>
      <ul className="space-y-1.5 mb-3">
        {rules.map((rule) => (
          <li key={rule.id} className="flex justify-between text-sm items-center gap-2 font-mono">
            <span className="truncate">{rule.field} <span className="text-rust">{rule.operator}</span> {rule.value}</span>
            <button className="text-xs text-ink-soft hover:text-rust-dark shrink-0" onClick={() => removeRule(rule.id)}>remove</button>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-ink-soft italic">No rules yet — showing everything.</li>}
      </ul>
      <div className="flex gap-1.5 flex-wrap items-center pt-3 border-t border-rule">
        <select className="border border-rule rounded-sm px-2 py-1 text-xs font-mono bg-paper" value={field} onChange={(e) => setField(e.target.value as RuleField)}>
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="border border-rule rounded-sm px-2 py-1 text-xs font-mono bg-paper" value={operator} onChange={(e) => setOperator(e.target.value as RuleOperator)}>
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input className="border border-rule rounded-sm px-2 py-1 text-xs font-mono flex-1 min-w-16 bg-paper" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
        <button className="px-3 py-1 rounded-sm bg-rust text-paper-raised text-xs font-mono uppercase tracking-wide hover:bg-rust-dark transition-colors" onClick={addRule}>Add</button>
      </div>
    </div>
  );
}

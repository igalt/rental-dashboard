import { describe, it, expect } from 'vitest';
import { buildFilterString } from './buildFilterString';
import type { FilterRule } from '../../types/listing';

const rule = (over: Partial<FilterRule>): FilterRule => ({
  id: 'x',
  field: 'price',
  operator: 'lt',
  value: '6000',
  rule_group: 0,
  ...over,
});

describe('buildFilterString', () => {
  it('returns null for no rules', () => {
    expect(buildFilterString([])).toBeNull();
  });

  it('ANDs rules within the same group', () => {
    const rules = [rule({ field: 'price', operator: 'lt', value: '6000' }), rule({ field: 'rooms', operator: 'gte', value: '3' })];
    expect(buildFilterString(rules)).toBe('or(and(price.lt.6000,rooms.gte.3))');
  });

  it('ORs across different groups', () => {
    const rules = [
      rule({ field: 'area', operator: 'eq', value: 'North', rule_group: 0 }),
      rule({ field: 'area', operator: 'eq', value: 'South', rule_group: 1 }),
    ];
    expect(buildFilterString(rules)).toBe('or(area.eq.North,area.eq.South)');
  });

  it('formats "in" operator values as a parenthesized list', () => {
    const rules = [rule({ field: 'area', operator: 'in', value: 'North, South' })];
    expect(buildFilterString(rules)).toBe('or(area.in.(North,South))');
  });

  it('quotes values that contain characters that would break the filter string', () => {
    const rules = [rule({ field: 'area', operator: 'eq', value: 'Tel Aviv, North' })];
    expect(buildFilterString(rules)).toBe('or(area.eq."Tel Aviv, North")');
  });

  it('does not quote values with no special characters', () => {
    const rules = [rule({ field: 'price', operator: 'lt', value: '6000' }), rule({ field: 'rooms', operator: 'gte', value: '3' })];
    expect(buildFilterString(rules)).toBe('or(and(price.lt.6000,rooms.gte.3))');
  });

  it('drops empty tokens from "in" values with trailing or double commas', () => {
    const rules = [rule({ field: 'area', operator: 'in', value: 'North, South,' })];
    expect(buildFilterString(rules)).toBe('or(area.in.(North,South))');
  });
});

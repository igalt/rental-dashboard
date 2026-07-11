export type Source = 'yad2' | 'facebook' | 'whatsapp' | 'manual';
export type MatchStatus = 'matched' | 'unmatched' | 'unclear';
export type RuleOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
export type RuleField = 'price' | 'rooms' | 'area' | 'move_in_date';

export interface Listing {
  id: string;
  source: Source;
  source_ref: string | null;
  title: string | null;
  price: number | null;
  rooms: number | null;
  area: string | null;
  move_in_date: string | null;
  raw_text: string | null;
  extracted_at: string;
  favorited: boolean;
  irrelevant: boolean;
  notes: string | null;
  possible_duplicate_of: string | null;
  delisted_at: string | null;
  updated_at: string;
}

export interface FilterRule {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  rule_group: number;
}

export interface Tag {
  id: string;
  label: string;
}

export interface ListingTag {
  listing_id: string;
  tag_id: string;
  match_status: MatchStatus;
  checked_at: string;
}

import { Select } from '../ui';

const sortOptions = [
  { value: 'curated', label: 'По рейтингу' },
  { value: 'newest', label: 'Новые' },
  { value: 'alphabetical', label: 'По алфавиту' },
];

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <Select
      options={sortOptions}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-auto"
    />
  );
}

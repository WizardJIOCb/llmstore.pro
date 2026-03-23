import { useState } from 'react';
import { Input } from '../ui';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Поиск...' }: SearchBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (e.target.value === '') {
      onSearch('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-sm">
      <Input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-9"
      />
    </form>
  );
}

import { Select } from '../ui';
import { useCategories } from '../../hooks/useTaxonomy';
import {
  pricingTypeLabels, deploymentTypeLabels, privacyTypeLabels,
  languageSupportLabels, difficultyLabels,
} from '../../lib/label-maps';

interface CatalogFiltersProps {
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function CatalogFilters({ filters, onChange }: CatalogFiltersProps) {
  const { data: categories } = useCategories();

  const categoryOptions = (categories ?? []).map((c) => ({ value: c.slug, label: c.name }));
  const pricingOptions = Object.entries(pricingTypeLabels).map(([v, l]) => ({ value: v, label: l }));
  const deploymentOptions = Object.entries(deploymentTypeLabels).map(([v, l]) => ({ value: v, label: l }));
  const privacyOptions = Object.entries(privacyTypeLabels).map(([v, l]) => ({ value: v, label: l }));
  const languageOptions = Object.entries(languageSupportLabels).map(([v, l]) => ({ value: v, label: l }));
  const difficultyOptions = Object.entries(difficultyLabels).map(([v, l]) => ({ value: v, label: l }));

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-1">Фильтры</span>
      <Select options={categoryOptions} placeholder="Категория" value={filters.category ?? ''} onChange={(e) => onChange('category', e.target.value)} className="h-8 text-xs px-2 py-0" />
      <Select options={pricingOptions} placeholder="Цена" value={filters.pricing ?? ''} onChange={(e) => onChange('pricing', e.target.value)} className="h-8 text-xs px-2 py-0" />
      <Select options={deploymentOptions} placeholder="Deploy" value={filters.deployment ?? ''} onChange={(e) => onChange('deployment', e.target.value)} className="h-8 text-xs px-2 py-0" />
      <Select options={privacyOptions} placeholder="Приватность" value={filters.privacy ?? ''} onChange={(e) => onChange('privacy', e.target.value)} className="h-8 text-xs px-2 py-0" />
      <Select options={languageOptions} placeholder="Язык" value={filters.language ?? ''} onChange={(e) => onChange('language', e.target.value)} className="h-8 text-xs px-2 py-0" />
      <Select options={difficultyOptions} placeholder="Уровень" value={filters.difficulty ?? ''} onChange={(e) => onChange('difficulty', e.target.value)} className="h-8 text-xs px-2 py-0" />
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => {
            for (const key of Object.keys(filters)) {
              onChange(key, '');
            }
          }}
          className="ml-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Сбросить ({activeCount})
        </button>
      )}
    </div>
  );
}

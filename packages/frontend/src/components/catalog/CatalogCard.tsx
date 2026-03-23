import { Link } from 'react-router-dom';
import type { CatalogItemCard } from '@llmstore/shared';
import { Card, CardContent, Badge } from '../ui';
import { pricingTypeLabels, deploymentTypeLabels, languageSupportLabels } from '../../lib/label-maps';

const typeRouteMap: Record<string, string> = {
  tool: '/tools',
  model: '/models',
  prompt_pack: '/packs',
  workflow_pack: '/packs',
  business_agent: '/agents',
  developer_asset: '/assets',
  local_build: '/local',
  stack_preset: '/stacks',
  guide: '/guides',
};

interface CatalogCardProps {
  item: CatalogItemCard;
}

export function CatalogCard({ item }: CatalogCardProps) {
  const basePath = typeRouteMap[item.type] ?? '/tools';
  const href = `${basePath}/${item.slug}`;

  return (
    <Link to={href} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        {item.hero_image_url && (
          <div className="aspect-video overflow-hidden rounded-t-lg">
            <img
              src={item.hero_image_url}
              alt={item.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        )}
        <CardContent className={item.hero_image_url ? 'p-4' : 'p-4 pt-4'}>
          <div className="mb-2 flex flex-wrap gap-1">
            {item.featured && <Badge variant="warning">Featured</Badge>}
            {item.meta.pricing_type && (
              <Badge variant="outline">
                {pricingTypeLabels[item.meta.pricing_type] ?? item.meta.pricing_type}
              </Badge>
            )}
            {item.meta.deployment_type && (
              <Badge variant="secondary">
                {deploymentTypeLabels[item.meta.deployment_type] ?? item.meta.deployment_type}
              </Badge>
            )}
            {item.meta.language_support && (
              <Badge variant="secondary">
                {languageSupportLabels[item.meta.language_support] ?? item.meta.language_support}
              </Badge>
            )}
          </div>
          <h3 className="mb-1 text-base font-semibold leading-tight group-hover:text-primary">
            {item.title}
          </h3>
          {item.short_description && (
            <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
              {item.short_description}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map((tag) => (
                <span key={tag.id} className="text-xs text-muted-foreground">
                  #{tag.slug}
                </span>
              ))}
              {item.tags.length > 4 && (
                <span className="text-xs text-muted-foreground">+{item.tags.length - 4}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

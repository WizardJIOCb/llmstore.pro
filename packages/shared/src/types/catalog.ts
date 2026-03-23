import type {
  ContentType,
  ItemStatus,
  Visibility,
  PricingType,
  DeploymentType,
  PrivacyType,
  LanguageSupport,
  Difficulty,
  Readiness,
} from '../constants/index.js';
import type { UserSlim } from './auth.js';

export interface TagSlim {
  id: string;
  name: string;
  slug: string;
}

export interface CategorySlim {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface UseCaseSlim {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogItemMeta {
  pricing_type: PricingType | null;
  deployment_type: DeploymentType | null;
  privacy_type: PrivacyType | null;
  language_support: LanguageSupport | null;
  difficulty: Difficulty | null;
  readiness: Readiness | null;
  vendor_name: string | null;
  source_url: string | null;
  docs_url: string | null;
  github_url: string | null;
  website_url: string | null;
  metadata_json: Record<string, unknown> | null;
}

export interface CatalogItemCard {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  short_description: string | null;
  hero_image_url: string | null;
  curated_score: number;
  featured: boolean;
  tags: TagSlim[];
  categories: CategorySlim[];
  meta: Pick<CatalogItemMeta, 'pricing_type' | 'deployment_type' | 'language_support' | 'privacy_type'>;
  published_at: string | null;
}

export interface CatalogItemFull extends CatalogItemCard {
  full_description: string | null;
  status: ItemStatus;
  visibility: Visibility;
  seo_title: string | null;
  seo_description: string | null;
  author: UserSlim | null;
  meta_full: CatalogItemMeta;
  use_cases: UseCaseSlim[];
  related_items: CatalogItemCard[];
}

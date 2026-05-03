import type { NewsArticle } from './api/news';

export interface NewsProductBadge {
  label: string;
  className: string;
}

export interface NewsTryLink {
  label: string;
  description: string;
  href: string;
}

function getArticleText(article: Pick<NewsArticle, 'title' | 'excerpt' | 'content'>): string {
  return [article.title, article.excerpt ?? '', article.content].join(' ').toLowerCase();
}

export function getNewsProductBadge(article: Pick<NewsArticle, 'title' | 'excerpt' | 'content'>): NewsProductBadge {
  const text = getArticleText(article);

  if (/(roadmap|milestone|план|роадмап|вех)/i.test(text)) {
    return {
      label: 'Roadmap',
      className: 'border-sky-200 bg-sky-50 text-sky-800',
    };
  }

  if (/(гайд|guide|how to|инструкция|как\s)/i.test(text)) {
    return {
      label: 'Guide',
      className: 'border-violet-200 bg-violet-50 text-violet-800',
    };
  }

  if (/(релиз|release|changelog|shipped|обновлен|обновление|запустили)/i.test(text)) {
    return {
      label: 'Release',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  return {
    label: 'Product update',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

export function getNewsTryLinks(article: Pick<NewsArticle, 'title' | 'excerpt' | 'content'>): NewsTryLink[] {
  const text = getArticleText(article);
  const links: NewsTryLink[] = [];

  if (/(агент|agent|builder|конструктор|шаблон)/i.test(text)) {
    links.push({
      label: 'Собрать агента',
      description: 'Открыть конструктор и пройти быстрый сценарий выбора роли, модели и возможностей.',
      href: '/builder/stack',
    });
  }

  if (/(preview|галере|gallery|лендинг|landing|проект|runnable|demo)/i.test(text)) {
    links.push({
      label: 'Открыть галерею',
      description: 'Посмотреть публичные preview, runnable projects и чаты, из которых они были собраны.',
      href: '/gallery',
    });
  }

  if (/(цена|pricing|оплат|баланс|стоим|тариф|yookassa|юkassa|юкасса)/i.test(text)) {
    links.push({
      label: 'Понять списания',
      description: 'Посмотреть фиксированные пополнения, сценарии расходов, оферту и контакты.',
      href: '/pricing',
    });
  }

  if (/(roadmap|milestone|план|вех|следующ|заплан)/i.test(text)) {
    links.push({
      label: 'Смотреть roadmap',
      description: 'Проверить, что уже shipped, что сейчас в работе и какие слои запланированы дальше.',
      href: '/milestones',
    });
  }

  if (links.length === 0) {
    links.push(
      {
        label: 'Смотреть roadmap',
        description: 'Понять, как обновление вписывается в развитие продукта.',
        href: '/milestones',
      },
      {
        label: 'Открыть галерею',
        description: 'Перейти к публичным результатам и живым примерам.',
        href: '/gallery',
      },
    );
  }

  return links.slice(0, 3);
}

export const STORES = Object.freeze({
  nosura: { key: 'nosura', slug: 'nonali', name: 'Nonali', home_url: 'https://nonali.com/', support_email: 'support@nonali.com', review_domain: 'nonali.com' },
  celzoir: { key: 'celzoir', slug: 'loomlu', name: 'Loomlu', home_url: 'https://loomlu.com/', support_email: 'support@loomlu.com', review_domain: 'loomlu.com' },
  vicancio: { key: 'vicancio', slug: 'muupa', name: 'Muupa', home_url: 'https://muupa.com/', support_email: 'support@muupa.com', review_domain: 'muupa.com' },
  decorivialiving: { key: 'decorivialiving', slug: 'decorivialiving', name: 'DecoriviaLiving', home_url: 'https://decorivialiving.com/', support_email: 'info@decorivialiving.com', review_domain: 'decorivialiving.com' },
  'lasson-living': { key: 'lasson-living', slug: 'lasson', name: 'Lasson Living', home_url: 'https://lassonliving.co/', support_email: 'support@lassonliving.com', review_domain: 'lassonliving.co' },
  hale: { key: 'hale', slug: 'hale', name: 'Hale New York', home_url: 'https://hale-newyork.com/', support_email: 'info@hale-newyork.com', review_domain: 'hale-newyork.com' },
  'zoe-sydney': { key: 'zoe-sydney', slug: 'livadora', name: 'Livadora', home_url: 'https://livadora.com/', support_email: 'support@livadora.com', review_domain: 'livadora.com' },
  'house-of-nova-london': { key: 'house-of-nova-london', slug: 'nova', name: 'House of Nova London', home_url: 'https://houseofnovalondon.com/', support_email: 'support@houseofnova-london.com', review_domain: 'houseofnovalondon.com' }
});

export const ALIASES = Object.freeze({ lasso: 'lasson-living', nosu: 'nosura', vic: 'vicancio', zoesyd: 'zoe-sydney' });
export const ROUTES = Object.freeze(Object.fromEntries([
  ...Object.values(STORES).map(store => [store.slug, store.key]),
  ...Object.entries(ALIASES)
]));

export function storeForPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 2 && ['index.html', 'thankyou.html'].includes(parts[1])) parts.pop();
  if (parts.length !== 1 || !Object.hasOwn(ROUTES, parts[0])) return null;
  return STORES[ROUTES[parts[0]]];
}

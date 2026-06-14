export default async function handler(req, res) {
  const AL = 'https://graphql.anilist.co';

  async function fetchAnime(page, sort, filter = '') {
    const query = `
      query($page: Int) {
        Page(page: $page, perPage: 50) {
          pageInfo { hasNextPage }
          media(sort: ${sort}, type: ANIME, isAdult: false ${filter}) {
            id
            title { romaji english native }
          }
        }
      }`;
    const r = await fetch(AL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { page } })
    });
    const j = await r.json();
    return j.data?.Page;
  }

  function toSlug(titleObj) {
    const raw = titleObj.english || titleObj.romaji || titleObj.native || 'anime';
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  try {
    const allAnime = new Map();

    const categories = [
      { sort: 'TRENDING_DESC', filter: '' },
      { sort: 'SCORE_DESC', filter: '' },
      { sort: 'POPULARITY_DESC', filter: ', status: RELEASING' },
    ];

    for (const cat of categories) {
      for (let page = 1; page <= 10; page++) {
        const data = await fetchAnime(page, cat.sort, cat.filter);
        if (!data) break;
        data.media.forEach(a => allAnime.set(a.id, a));
        if (!data.pageInfo.hasNextPage) break;
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const staticUrls = `
  <url>
    <loc>https://kage-watch.vercel.app/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://kage-watch.vercel.app/trending</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://kage-watch.vercel.app/top-rated</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://kage-watch.vercel.app/airing</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;

    const animeUrls = [...allAnime.values()].map(a => {
      const title = toSlug(a.title);
      return `
  <url>
    <loc>https://kage-watch.vercel.app/watch/${a.id}/${title}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${animeUrls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).send(xml);

  } catch (err) {
    res.status(500).send('Sitemap generation failed: ' + err.message);
  }
}

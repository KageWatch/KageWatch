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
    try {
      const r = await fetch(AL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { page } })
      });
      const j = await r.json();
      return j.data?.Page?.media || [];
    } catch (e) {
      console.error(`Error fetching page ${page} for sort ${sort}:`, e);
      return [];
    }
  }

  function toSlug(titleObj) {
    const raw = titleObj.english || titleObj.romaji || titleObj.native || 'anime';
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

    // Build promises to fetch 5 pages concurrently per category (250 items per category)
    // This is extremely fast, prevents 504 timeouts, and easily keeps under AniList rate limits.
    const promises = [];
    for (const cat of categories) {
      for (let page = 1; page <= 5; page++) {
        promises.push(fetchAnime(page, cat.sort, cat.filter));
      }
    }

    const results = await Promise.all(promises);

    // Merge unique anime by ID
    results.flat().forEach(a => {
      if (a && a.id) {
        allAnime.set(a.id, a);
      }
    });

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

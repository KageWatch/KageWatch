export default async function handler(req, res) {
  const AL = 'https://graphql.anilist.co';

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
    const query = `query {
      t1: Page(page: 1, perPage: 50) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      t2: Page(page: 2, perPage: 50) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      t3: Page(page: 3, perPage: 50) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      t4: Page(page: 4, perPage: 50) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      s1: Page(page: 1, perPage: 50) { media(sort: SCORE_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      s2: Page(page: 2, perPage: 50) { media(sort: SCORE_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      s3: Page(page: 3, perPage: 50) { media(sort: SCORE_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      s4: Page(page: 4, perPage: 50) { media(sort: SCORE_DESC, type: ANIME, isAdult: false) { id title { romaji english native } } }
      r1: Page(page: 1, perPage: 50) { media(sort: POPULARITY_DESC, type: ANIME, status: RELEASING, isAdult: false) { id title { romaji english native } } }
      r2: Page(page: 2, perPage: 50) { media(sort: POPULARITY_DESC, type: ANIME, status: RELEASING, isAdult: false) { id title { romaji english native } } }
      r3: Page(page: 3, perPage: 50) { media(sort: POPULARITY_DESC, type: ANIME, status: RELEASING, isAdult: false) { id title { romaji english native } } }
      r4: Page(page: 4, perPage: 50) { media(sort: POPULARITY_DESC, type: ANIME, status: RELEASING, isAdult: false) { id title { romaji english native } } }
    }`;

    const r = await fetch(AL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const j = await r.json();

    if (j.errors && j.errors.length > 0) {
      throw new Error(j.errors[0].message);
    }

    const allAnime = new Map();
    if (j.data) {
      Object.keys(j.data).forEach(key => {
        const mediaList = j.data[key]?.media || [];
        mediaList.forEach(a => {
          if (a && a.id) {
            allAnime.set(a.id, a);
          }
        });
      });
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

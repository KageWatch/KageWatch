import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Extract path and query parameters mapped by Vercel routing
  const query = req.query || {};
  const queryId = query.id;
  const querySlug = query.slug;
  const queryPath = query.path;

  // Fallback path parsing (for local dev environments or custom proxies)
  const originalPath = req.headers['x-vercel-forwarded-path'] || req.url || '/';
  const watchMatch = originalPath.match(/^\/watch\/(\d+)(?:\/([^/?#]+))?/);

  const id = queryId || (watchMatch ? watchMatch[1] : null);
  const slug = querySlug || (watchMatch && watchMatch[2] ? watchMatch[2] : 'anime');

  const isTrending = queryPath === 'trending' || originalPath.startsWith('/trending');
  const isTopRated = queryPath === 'top-rated' || originalPath.startsWith('/top-rated');
  const isAiring = queryPath === 'airing' || originalPath.startsWith('/airing');
  const isWatchlist = queryPath === 'watchlist' || originalPath.startsWith('/watchlist');

  // Load index.html template from disk
  let html;
  try {
    const filePath = path.join(process.cwd(), 'index.html');
    html = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return res.status(500).send('Error reading template: ' + err.message);
  }

  // Helper function to escape HTML entities for safety in meta tags
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper function to perform regex replacement of head SEO tags
  function replaceMeta(htmlContent, metadata) {
    let resHtml = htmlContent;

    // Replace Title
    resHtml = resHtml.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);

    // Replace Description
    resHtml = resHtml.replace(/<meta\s+name="description"\s+content="[^"]*">/i, `<meta name="description" content="${escapeHtml(metadata.desc)}">`);

    // Replace Canonical Link
    resHtml = resHtml.replace(/<link\s+id="canonical-link"\s+rel="canonical"\s+href="[^"]*">/i, `<link id="canonical-link" rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">`);

    // Replace OpenGraph URL
    resHtml = resHtml.replace(/<meta\s+property="og:url"\s+content="[^"]*">/i, `<meta property="og:url" content="${escapeHtml(metadata.canonicalUrl)}">`);

    // Replace OpenGraph Title
    resHtml = resHtml.replace(/<meta\s+property="og:title"\s+content="[^"]*">/i, `<meta property="og:title" content="${escapeHtml(metadata.title)}">`);

    // Replace OpenGraph Description
    resHtml = resHtml.replace(/<meta\s+property="og:description"\s+content="[^"]*">/i, `<meta property="og:description" content="${escapeHtml(metadata.desc)}">`);

    // Replace OpenGraph Image
    resHtml = resHtml.replace(/<meta\s+property="og:image"\s+content="[^"]*">/i, `<meta property="og:image" content="${escapeHtml(metadata.ogImage)}">`);

    // Inject Twitter Card tags and Schema markup right before </head>
    let additionalHead = `
  <!-- Twitter Card metadata -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(metadata.title)}">
  <meta name="twitter:description" content="${escapeHtml(metadata.desc)}">
  <meta name="twitter:image" content="${escapeHtml(metadata.ogImage)}">
`;

    if (metadata.schema) {
      additionalHead += `
  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">
  ${JSON.stringify(metadata.schema, null, 2)}
  </script>
`;
    }

    additionalHead += '\n</head>';
    resHtml = resHtml.replace('</head>', additionalHead);

    return resHtml;
  }

  // If this is a watch page, fetch dynamic data from AniList
  if (id) {

    try {
      const query = `
        query($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
            }
            bannerImage
            description(asHtml: false)
            averageScore
            episodes
            status
            format
            genres
            startDate {
              year
            }
          }
        }
      `;

      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(id) } })
      });

      if (!response.ok) {
        throw new Error(`AniList GraphQL response error: ${response.status}`);
      }

      const result = await response.json();
      const media = result.data?.Media;

      if (media) {
        const romajiTitle = media.title.romaji || '';
        const englishTitle = media.title.english || '';
        const nativeTitle = media.title.native || '';
        const title = englishTitle || romajiTitle || 'Watch Anime Online';

        const cleanDesc = media.description
          ? media.description.replace(/<[^>]*>/g, '').slice(0, 160).trim() + '...'
          : 'Watch anime online for free on KageWatch. Stream the latest episodes in Sub & Dub.';

        const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large || 'https://kage-watch.vercel.app/favicon.png';
        const ogImage = media.bannerImage || coverUrl;
        
        const cleanSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        const canonicalUrl = `https://kage-watch.vercel.app/watch/${media.id}/${watchMatch[2] ? slug : cleanSlug}`;

        const isMovie = media.format === 'MOVIE';
        const score = media.averageScore ? (media.averageScore / 10).toFixed(1) : '8.0';

        // Schema.org JSON-LD
        const schema = {
          "@context": "https://schema.org",
          "@type": isMovie ? "Movie" : "TVSeries",
          "name": title,
          "alternativeHeadline": romajiTitle !== title ? romajiTitle : undefined,
          "image": coverUrl,
          "description": cleanDesc,
          "genre": media.genres || [],
          "url": canonicalUrl
        };

        if (!isMovie) {
          schema.numberOfEpisodes = media.episodes || undefined;
        }

        if (media.averageScore) {
          schema.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": score,
            "bestRating": "10",
            "worstRating": "1",
            "ratingCount": "1250"
          };
        }

        const metadata = {
          title: `${title} - Watch Online Free | KageWatch`,
          desc: `Watch ${title} online for free in high quality with Sub & Dub. ${cleanDesc}`,
          canonicalUrl,
          ogImage,
          schema
        };

        const parsedHtml = replaceMeta(html, metadata);
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
        return res.status(200).send(parsedHtml);
      } else {
        throw new Error('Media not found on AniList');
      }
    } catch (err) {
      console.error('Failed to generate dynamic watch page metadata: ', err);
      const fallbackMetadata = {
        title: 'Watch Anime Online Free | KageWatch',
        desc: 'Watch anime online for free on KageWatch. Stream the latest episodes in Sub & Dub.',
        canonicalUrl: `https://kage-watch.vercel.app/watch/${id}/${slug}`,
        ogImage: 'https://kage-watch.vercel.app/favicon.png'
      };
      const parsedHtml = replaceMeta(html, fallbackMetadata);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
      return res.status(200).send(parsedHtml);
    }
  }

  // Handle static sub-pages
  let metadata = null;
  if (isTrending) {
    metadata = {
      title: 'Trending Anime - Watch Online Free | KageWatch',
      desc: 'Discover and watch the most popular trending anime online for free on KageWatch. Stream in high quality with Sub & Dub support.',
      canonicalUrl: 'https://kage-watch.vercel.app/trending',
      ogImage: 'https://kage-watch.vercel.app/favicon.png',
      schema: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Trending Anime - KageWatch",
        "url": "https://kage-watch.vercel.app/trending",
        "description": "Discover and watch the most popular trending anime online for free on KageWatch."
      }
    };
  } else if (isTopRated) {
    metadata = {
      title: 'Top Rated Anime - Watch Online Free | KageWatch',
      desc: 'Explore the highest-rated anime of all time on KageWatch. Stream top-rated shows in Sub and Dub.',
      canonicalUrl: 'https://kage-watch.vercel.app/top-rated',
      ogImage: 'https://kage-watch.vercel.app/favicon.png',
      schema: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Top Rated Anime - KageWatch",
        "url": "https://kage-watch.vercel.app/top-rated",
        "description": "Explore the highest-rated anime of all time on KageWatch."
      }
    };
  } else if (isAiring) {
    metadata = {
      title: 'Currently Airing Anime - Watch Online Free | KageWatch',
      desc: 'Watch currently airing weekly anime episodes online for free. Check schedules and stream newly released shows on KageWatch.',
      canonicalUrl: 'https://kage-watch.vercel.app/airing',
      ogImage: 'https://kage-watch.vercel.app/favicon.png',
      schema: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Currently Airing Anime - KageWatch",
        "url": "https://kage-watch.vercel.app/airing",
        "description": "Watch currently airing weekly anime episodes online for free."
      }
    };
  } else if (isWatchlist) {
    metadata = {
      title: 'My Watchlist - KageWatch',
      desc: 'Access your personal anime watchlist on KageWatch. Track and stream your favorite anime series.',
      canonicalUrl: 'https://kage-watch.vercel.app/watchlist',
      ogImage: 'https://kage-watch.vercel.app/favicon.png',
      schema: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "My Watchlist - KageWatch",
        "url": "https://kage-watch.vercel.app/watchlist",
        "description": "Access your personal anime watchlist on KageWatch."
      }
    };
  }

  if (metadata) {
    const parsedHtml = replaceMeta(html, metadata);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
    return res.status(200).send(parsedHtml);
  }

  // Final fallback: serve unmodified index.html
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
  res.status(200).send(html);
}

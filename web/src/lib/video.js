// Turns a video link from Sanity into what Media.astro needs.
// Vimeo page links become embedded players. Direct file links play in a <video> tag.

const FILE_EXTENSION = /\.(mp4|webm|m4v|mov)$/i;

export function parseVideoUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const isVimeo = /(^|\.)vimeo\.com$/.test(parsed.hostname);
  // Vimeo's "Video file links" point at the file itself, not at a player.
  const isFileLink =
    FILE_EXTENSION.test(parsed.pathname) ||
    (isVimeo && /\/(progressive_redirect|external)\//.test(parsed.pathname));

  if (isFileLink) return { source: 'file', src: url };
  if (!isVimeo) return null;

  // Matches vimeo.com/123, vimeo.com/123/abc (unlisted), player.vimeo.com/video/123?h=abc
  // and channel or showcase links that end in the video ID.
  const match = parsed.pathname.match(/\/(\d{6,})(?:\/([\da-f]{6,}))?\/?$/);
  if (!match) return null;
  return {
    source: 'vimeo',
    id: match[1],
    hash: match[2] ?? parsed.searchParams.get('h') ?? undefined,
    url,
  };
}

function vimeoEmbedUrl({ id, hash }, options) {
  const params = new URLSearchParams({ ...(hash && { h: hash }), dnt: '1', ...options });
  return `https://player.vimeo.com/video/${id}?${params}`;
}

// Vimeo's oEmbed API gives the video's thumbnail without loading the player.
const thumbnails = new Map();

function vimeoThumbnail(url) {
  if (!thumbnails.has(url)) {
    const request = fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=1920`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        data?.thumbnail_url
          ? {
              kind: 'image',
              src: data.thumbnail_url,
              width: data.thumbnail_width,
              height: data.thumbnail_height,
              alt: '',
            }
          : null,
      )
      // Some privacy settings block oEmbed. The player still works without a poster.
      .catch(() => null);
    thumbnails.set(url, request);
  }
  return thumbnails.get(url);
}

export async function toVideo(url, poster) {
  const video = url && parseVideoUrl(url);
  if (!video) return null;

  if (video.source === 'file') return { kind: 'video', source: 'file', src: video.src, poster };

  return {
    kind: 'video',
    source: 'vimeo',
    // Starts playing, because the visitor already clicked play on the poster.
    playerSrc: vimeoEmbedUrl(video, { autoplay: '1' }),
    // Muted, looping and without controls. Needs a paid Vimeo plan.
    loopSrc: vimeoEmbedUrl(video, { background: '1' }),
    poster: poster ?? (await vimeoThumbnail(video.url)),
  };
}

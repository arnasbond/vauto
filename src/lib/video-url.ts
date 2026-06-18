export function parseVideoUrl(url: string): {
  hasVideo: boolean;
  thumbnail?: string;
} {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) {
    return {
      hasVideo: true,
      thumbnail: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`,
    };
  }
  if (/tiktok\.com|instagram\.com\/reel/i.test(url)) {
    return { hasVideo: true };
  }
  return { hasVideo: false };
}

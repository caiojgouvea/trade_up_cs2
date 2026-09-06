export function steamIconUrl(iconUrl, size = 64) {
  if (!iconUrl) return null;
  return `https://community.steamstatic.com/economy/image/${iconUrl}/${size}fx${size}f`;
}

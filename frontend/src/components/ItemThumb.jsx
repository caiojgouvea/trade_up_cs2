import { COLORS } from "../lib/colors";
import { steamIconUrl } from "../lib/steamImage";
import { rarityColor } from "../lib/rarity";

export default function ItemThumb({ iconUrl, rarity, size = 40 }) {
  const src = steamIconUrl(iconUrl, size * 2);
  const borderColor = rarityColor(rarity, COLORS.border);
  const frameThickness = Math.max(3, Math.round(size * 0.12));

  const frameStyle = {
    display: "inline-flex",
    padding: frameThickness,
    background: borderColor,
    borderRadius: 5,
    flexShrink: 0,
    lineHeight: 0,
  };
  const innerStyle = {
    width: size,
    height: size,
    borderRadius: 2,
    background: COLORS.panelAlt,
    objectFit: "contain",
    display: "block",
  };

  return (
    <div style={frameStyle}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          style={innerStyle}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        <div style={innerStyle} />
      )}
    </div>
  );
}

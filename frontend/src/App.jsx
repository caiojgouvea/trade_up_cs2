import { useState } from "react";
import { Crosshair, Layers, Sparkles } from "lucide-react";
import { COLORS } from "./lib/colors";
import TradeUpComparator from "./components/TradeUpComparator";
import CollectionsExplorer from "./components/CollectionsExplorer";
import Suggestions from "./components/Suggestions";

const TABS = [
  { id: "suggestions", label: "Sugestões", icon: Sparkles },
  { id: "comparator", label: "Comparador manual", icon: Crosshair },
  { id: "collections", label: "Coleções & Preços", icon: Layers },
];

function App() {
  const [tab, setTab] = useState("suggestions");

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 20px 0",
        }}
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: tab === id ? COLORS.panel : "transparent",
              color: tab === id ? COLORS.gold : COLORS.textDim,
              border: `1px solid ${tab === id ? COLORS.border : "transparent"}`,
              borderBottom: tab === id ? `1px solid ${COLORS.panel}` : "1px solid transparent",
              borderRadius: "8px 8px 0 0",
              padding: "8px 14px",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              position: "relative",
              top: 1,
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "suggestions" && <Suggestions />}
      {tab === "comparator" && <TradeUpComparator />}
      {tab === "collections" && <CollectionsExplorer />}
    </div>
  );
}

export default App;

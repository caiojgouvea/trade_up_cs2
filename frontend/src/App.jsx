import { useState } from "react";
import { Crosshair, Layers, Sparkles, Shuffle, History, Globe } from "lucide-react";
import { COLORS } from "./lib/colors";
import { useI18n } from "./lib/i18n";
import TradeUpComparator from "./components/TradeUpComparator";
import CollectionsExplorer from "./components/CollectionsExplorer";
import Suggestions from "./components/Suggestions";
import ManipulatedSuggestions from "./components/ManipulatedSuggestions";
import SuggestionHistory from "./components/SuggestionHistory";

const TABS = [
  { id: "suggestions", label: "Suggestions", icon: Sparkles },
  { id: "manipulated", label: "Manipulated", icon: Shuffle },
  { id: "history", label: "History", icon: History },
  { id: "comparator", label: "Manual comparator", icon: Crosshair },
  { id: "collections", label: "Collections & Prices", icon: Layers },
];

const selectStyle = {
  background: COLORS.panel,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 12,
  cursor: "pointer",
};

function App() {
  const [tab, setTab] = useState("suggestions");
  const { lang, setLang, currency, setCurrency, t } = useI18n();

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          maxWidth: "min(1800px, 96vw)",
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
            {t(label)}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={14} color={COLORS.textDim} />
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={selectStyle}>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
            <option value="usd">USD ($)</option>
            <option value="brl">BRL (R$)</option>
          </select>
        </div>
      </div>

      {tab === "suggestions" && <Suggestions />}
      {tab === "manipulated" && <ManipulatedSuggestions />}
      {tab === "history" && <SuggestionHistory />}
      {tab === "comparator" && <TradeUpComparator />}
      {tab === "collections" && <CollectionsExplorer />}
    </div>
  );
}

export default App;

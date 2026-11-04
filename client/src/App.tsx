import { Navigate, Route, Routes } from "react-router";
import { Rail } from "./components/Rail";
import { ThemeEffect } from "./components/ThemeEffect";
import { BossesPage } from "./pages/BossesPage";
import { ChecklistPage } from "./pages/ChecklistPage";
import { ExpTablePage } from "./pages/ExpTablePage";
import { FamiliarsPage } from "./pages/FamiliarsPage";
import { HexaPage } from "./pages/HexaPage";
import { StatsPage } from "./pages/StatsPage";
import { SymbolsPage } from "./pages/SymbolsPage";
import { HomePage } from "./pages/HomePage";
import { FlamesPage } from "./pages/FlamesPage";
import { PotentialPage } from "./pages/PotentialPage";
import { UpgradesPage } from "./pages/UpgradesPage";
import { StarForcePage } from "./pages/StarForcePage";
import { GearPage } from "./pages/GearPage";
import { TbdPage } from "./pages/TbdPage";
import { ThemesPage } from "./pages/ThemesPage";

export function App() {
  return (
    <>
      <ThemeEffect />
      <div className="app">
        <Rail />
        <main className="page">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/bosses" element={<BossesPage />} />
            <Route path="/checklist" element={<ChecklistPage />} />
            <Route path="/symbols" element={<SymbolsPage />} />
            <Route path="/hexa" element={<HexaPage />} />
            <Route path="/familiars" element={<FamiliarsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/gear" element={<GearPage />} />
            <Route path="/gear/flames" element={<FlamesPage />} />
            <Route path="/gear/starforce" element={<StarForcePage />} />
            <Route path="/gear/potential" element={<PotentialPage />} />
            <Route path="/gear/upgrades" element={<UpgradesPage />} />
            <Route path="/tbd/:n" element={<TbdPage />} />
            <Route path="/exp-table" element={<ExpTablePage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

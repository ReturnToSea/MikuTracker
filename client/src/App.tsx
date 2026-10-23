import { Navigate, Route, Routes } from "react-router";
import { Rail } from "./components/Rail";
import { ThemeEffect } from "./components/ThemeEffect";
import { BossesPage } from "./pages/BossesPage";
import { ExpTablePage } from "./pages/ExpTablePage";
import { HomePage } from "./pages/HomePage";
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

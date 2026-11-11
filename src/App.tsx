import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Board from "./pages/Board";
import CompanyPage from "./pages/CompanyPage";
import Entry from "./pages/Entry";
import Scorecard from "./pages/Scorecard";
import Guide from "./pages/Guide";
import Login from "./pages/Login";
import { FigurePage, KpiPage } from "./pages/Detail";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Board />} />
        <Route path="c/:slug" element={<CompanyPage />} />
        <Route path="c/:slug/top/:code" element={<FigurePage />} />
        <Route path="c/:slug/kpi/:category" element={<KpiPage />} />
        <Route path="entry" element={<Entry />} />
        <Route path="scorecard" element={<Scorecard />} />
        <Route path="guide" element={<Guide />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Board from "./pages/Board";
import CompanyPage from "./pages/CompanyPage";
import Entry from "./pages/Entry";
import Scorecard from "./pages/Scorecard";
import Login from "./pages/Login";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Board />} />
        <Route path="c/:slug" element={<CompanyPage />} />
        <Route path="entry" element={<Entry />} />
        <Route path="scorecard" element={<Scorecard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

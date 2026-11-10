import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignalsPage } from "./pages/SignalsPage";
import { WorkspacePage } from "./workspace/WorkspacePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
      <Route path="/runs" element={<RunsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/signals" element={<SignalsPage />} />
      <Route path="/charts" element={<Navigate to="/workspace" replace />} />
      <Route path="/pipeline" element={<Navigate to="/workspace" replace />} />
      <Route path="/lab" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

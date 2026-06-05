import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth-context";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import MastersPage from "./pages/MastersPage";
import HouseholdsPage from "./pages/HouseholdsPage";
import HouseholdMembersPage from "./pages/HouseholdMembersPage";
import TasksPage from "./pages/TasksPage";
import DataQualityPage from "./pages/DataQualityPage";
import SyncLogsPage from "./pages/SyncLogsPage";
import EligibleWomenPage from "./pages/EligibleWomenPage";
import PregnantWomenPage from "./pages/PregnantWomenPage";
import ChildrenPage from "./pages/ChildrenPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/masters" element={<MastersPage />} />
              <Route path="/households" element={<HouseholdsPage />} />
              <Route path="/household-members" element={<HouseholdMembersPage />} />
              <Route path="/household-members/:householdId" element={<HouseholdMembersPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/data-quality" element={<DataQualityPage />} />
              <Route path="/sync-logs" element={<SyncLogsPage />} />
              <Route path="/eligible-women" element={<EligibleWomenPage />} />
              <Route
                path="/eligible-pregnancy-tracking"
                element={<EligibleWomenPage trackingOnly />}
              />
              <Route path="/pregnant-women" element={<PregnantWomenPage />} />
              <Route path="/children" element={<ChildrenPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Every web session must complete TOTP enrollment before any protected
  // surface is available. Keep the setup route itself reachable.
  if (!user.totp_enabled && location.pathname !== "/security/totp-setup") {
    return <Navigate to="/security/totp-setup" replace />;
  }

  return <Outlet />;
}

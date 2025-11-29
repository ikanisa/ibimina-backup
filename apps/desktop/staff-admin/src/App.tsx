import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopLayout } from "@/components/DesktopLayout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { UpdaterListener } from "@/components/system/UpdaterListener";
import DashboardPage from "@/app/dashboard/page";
import LoginPage from "@/app/login/page";
import MfaChallengePage from "@/app/mfa-challenge/page";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UpdaterListener />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DesktopLayout>
                  <DashboardPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mfa-challenge" element={<MfaChallengePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold">404 - Not Found</h2>
      </div>
    </div>
  );
}

export default App;

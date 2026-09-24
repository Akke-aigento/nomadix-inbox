import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useT } from "@/i18n";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

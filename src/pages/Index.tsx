import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useT } from "@/i18n";

const Index = () => {
  const t = useT();
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  return <Navigate to={session ? "/inbox" : "/auth"} replace />;
};

export default Index;

import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

const Index = () => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  return <Navigate to={session ? "/inbox" : "/auth"} replace />;
};

export default Index;

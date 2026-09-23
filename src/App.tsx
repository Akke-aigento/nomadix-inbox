import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/auth/AuthProvider";
import { I18nProvider } from "@/i18n";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AuthPage from "./pages/AuthPage";
import InboxPage from "./pages/InboxPage";
import SettingsPage from "./pages/SettingsPage";
import RulesPage from "./pages/RulesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Donker blijft de standaard; de keuze staat in Instellingen > Voorkeuren. */}
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="nomadix.theme"
    >
      <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route
                  path="/inbox"
                  element={
                    <ProtectedRoute>
                      <InboxPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inbox/:threadId"
                  element={
                    <ProtectedRoute>
                      <InboxPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/rules"
                  element={
                    <ProtectedRoute>
                      <RulesPage />
                    </ProtectedRoute>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router";
import { Layout } from "./components/Layout";
import { EmptyState, Spinner } from "./components/ui";
import { useAuth } from "./context/auth";
import { ActivityPage } from "./pages/Activity";
import { AnalyticsPage } from "./pages/Analytics";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/Auth";
import { CalendarPage } from "./pages/Calendar";
import { DashboardPage } from "./pages/Dashboard";
import { HistoryPage } from "./pages/History";
import { ItemDetailPage } from "./pages/ItemDetail";
import { NotificationsPage } from "./pages/Notifications";
import { PantryPage } from "./pages/Pantry";
import { RecipeDetailPage } from "./pages/RecipeDetail";
import { RewardsPage } from "./pages/Rewards";
import { WelcomePage } from "./pages/Welcome";
import { RecipesPage } from "./pages/Recipes";
import { SettingsPage } from "./pages/Settings";
import { ShoppingPage } from "./pages/Shopping";
import { TrashPage } from "./pages/Trash";

/** Pages that need a signed-in user. The API enforces this too; this only redirects. */
function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Opening your pantry" />;
  // Visitors opening the home page see the welcome page; deep links go straight to sign-in
  if (!user) return <Navigate to={location.pathname === "/" ? "/welcome" : "/login"} replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Invite links (/join/ABCD2345) open Family sharing with the code filled in. */
function JoinRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/settings?tab=household&code=${encodeURIComponent(code)}`} replace />;
}

function GuestOnly() {
  const { user, loading } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (loading) return <Spinner />;
  // Once signed in, continue to the page that asked for sign-in (e.g. an invite link); same-site paths only
  const next = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  return user ? <Navigate to={next} replace /> : <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pantry" element={<PantryPage />} />
          <Route path="pantry/:id" element={<ItemDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="recipes/library/:id" element={<RecipeDetailPage source="library" key="library" />} />
          <Route path="recipes/online/:id" element={<RecipeDetailPage source="online" key="online" />} />
          <Route path="rewards" element={<RewardsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="join/:code" element={<JoinRedirect />} />
          <Route path="*" element={<EmptyState title="Page not found">That page doesn't exist. Use the menu to find your way back.</EmptyState>} />
        </Route>
      </Route>
    </Routes>
  );
}

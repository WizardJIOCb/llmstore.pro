import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/home/HomePage';
import { CatalogListPage } from './pages/catalog/CatalogListPage';
import { CatalogDetailPage } from './pages/catalog/CatalogDetailPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { AdminCatalogListPage } from './pages/admin/AdminCatalogListPage';
import { AdminCatalogFormPage } from './pages/admin/AdminCatalogFormPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminAgentsPage } from './pages/admin/AdminAgentsPage';
import { AdminNewsListPage } from './pages/admin/AdminNewsListPage';
import { AdminNewsFormPage } from './pages/admin/AdminNewsFormPage';
import { NewsListPage } from './pages/news/NewsListPage';
import { NewsDetailPage } from './pages/news/NewsDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StackBuilderPage } from './pages/builder/StackBuilderPage';
import { SavedStacksPage } from './pages/builder/SavedStacksPage';
import { SavedStackDetailPage } from './pages/builder/SavedStackDetailPage';
import { AgentBuilderPage } from './pages/builder/AgentBuilderPage';
import { AgentEditorPage } from './pages/builder/AgentEditorPage';
import { AgentPlaygroundPage } from './pages/playground/AgentPlaygroundPage';
import { AgentsDashboardPage } from './pages/dashboard/AgentsDashboardPage';
import { RunsDashboardPage } from './pages/dashboard/RunsDashboardPage';
import { AgentsHubPage } from './pages/agents/AgentsHubPage';
import { SharedChatPage } from './pages/shared/SharedChatPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { ChatsPage } from './pages/chats/ChatsPage';

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

export function App() {
  const location = useLocation();

  useEffect(() => {
    window.ym?.(108206991, 'hit', location.pathname + location.search);
  }, [location]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Catalog routes */}
        <Route path="/tools" element={<CatalogListPage type="tool" />} />
        <Route path="/tools/:slug" element={<CatalogDetailPage type="tool" />} />
        <Route path="/models" element={<CatalogListPage type="model" />} />
        <Route path="/models/:slug" element={<CatalogDetailPage type="model" />} />
        <Route path="/packs" element={<CatalogListPage type="prompt_pack" />} />
        <Route path="/packs/:slug" element={<CatalogDetailPage type="prompt_pack" />} />
        <Route path="/agents" element={<CatalogListPage type="business_agent" />} />
        <Route path="/agents/:slug" element={<CatalogDetailPage type="business_agent" />} />
        <Route path="/local" element={<CatalogListPage type="local_build" />} />
        <Route path="/local/:slug" element={<CatalogDetailPage type="local_build" />} />
        <Route path="/assets" element={<CatalogListPage type="developer_asset" />} />
        <Route path="/assets/:slug" element={<CatalogDetailPage type="developer_asset" />} />
        <Route path="/stacks" element={<CatalogListPage type="stack_preset" />} />
        <Route path="/stacks/:slug" element={<CatalogDetailPage type="stack_preset" />} />
        <Route path="/guides" element={<CatalogListPage type="guide" />} />

        {/* News routes */}
        <Route path="/news" element={<NewsListPage />} />
        <Route path="/news/:slug" element={<NewsDetailPage />} />

        {/* Builder routes */}
        <Route path="/builder/stack" element={<StackBuilderPage />} />
        <Route path="/builder/agent" element={
          <ProtectedRoute>
            <AgentBuilderPage />
          </ProtectedRoute>
        } />
        <Route path="/builder/agent/:id" element={
          <ProtectedRoute>
            <AgentEditorPage />
          </ProtectedRoute>
        } />
        <Route path="/playground/agent/:id" element={
          <ProtectedRoute>
            <AgentPlaygroundPage />
          </ProtectedRoute>
        } />

        {/* Agents hub */}
        <Route path="/my/agents" element={
          <ProtectedRoute>
            <AgentsHubPage />
          </ProtectedRoute>
        } />

        {/* Chats */}
        <Route path="/chats" element={
          <ProtectedRoute>
            <ChatsPage />
          </ProtectedRoute>
        } />

        {/* Profile */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />

        {/* Shared chat (public, no auth) */}
        <Route path="/shared/chat/:token" element={<SharedChatPage />} />
        <Route path="/shared/chats/:token" element={<SharedChatPage />} />

        {/* Compare */}
        <Route path="/compare" element={<PlaceholderPage title="Сравнение" />} />

        {/* Russian market */}
        <Route path="/russian-market" element={<CatalogListPage type="model" filterLanguage="ru" />} />

        {/* Dashboard — placeholder */}
        <Route path="/dashboard" element={<PlaceholderPage title="Панель управления" />} />
        <Route path="/dashboard/saved" element={
          <ProtectedRoute>
            <SavedStacksPage />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/saved/:id" element={
          <ProtectedRoute>
            <SavedStackDetailPage />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/agents" element={
          <ProtectedRoute>
            <AgentsDashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/runs" element={
          <ProtectedRoute>
            <RunsDashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/costs" element={<PlaceholderPage title="Затраты" />} />

        {/* Admin routes */}
        <Route
          path="/admin/news"
          element={
            <ProtectedRoute requireAdmin>
              <AdminNewsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/news/new"
          element={
            <ProtectedRoute requireAdmin>
              <AdminNewsFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/news/:id"
          element={
            <ProtectedRoute requireAdmin>
              <AdminNewsFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminCatalogListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/items/new"
          element={
            <ProtectedRoute requireAdmin>
              <AdminCatalogFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/items/:id"
          element={
            <ProtectedRoute requireAdmin>
              <AdminCatalogFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requireAdmin>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <ProtectedRoute requireAdmin>
              <AdminAgentsPage />
            </ProtectedRoute>
          }
        />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-4">{title}</h1>
      <p className="text-muted-foreground">Этот раздел будет реализован в следующих этапах.</p>
    </div>
  );
}

import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/home/HomePage';
import { CatalogListPage } from './pages/catalog/CatalogListPage';
import { CatalogDetailPage } from './pages/catalog/CatalogDetailPage';
import { ArticleDetailPage } from './pages/catalog/ArticleDetailPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { AdminCatalogListPage } from './pages/admin/AdminCatalogListPage';
import { AdminCatalogFormPage } from './pages/admin/AdminCatalogFormPage';
import { AdminArticlesListPage } from './pages/admin/AdminArticlesListPage';
import { AdminArticleFormPage } from './pages/admin/AdminArticleFormPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminAgentsPage } from './pages/admin/AdminAgentsPage';
import { AdminNewsListPage } from './pages/admin/AdminNewsListPage';
import { AdminNewsFormPage } from './pages/admin/AdminNewsFormPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminChartsPage } from './pages/admin/AdminChartsPage';
import { AdminToolsPage } from './pages/admin/AdminToolsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminRuntimesPage } from './pages/admin/AdminRuntimesPage';
import { NewsListPage } from './pages/news/NewsListPage';
import { NewsDetailPage } from './pages/news/NewsDetailPage';
import { MilestonesPage } from './pages/milestones/MilestonesPage';
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
import { AgentPublicChatsPage } from './pages/agents/AgentPublicChatsPage';
import { ModelPublicChatsPage } from './pages/models/ModelPublicChatsPage';
import { SharedChatPage } from './pages/shared/SharedChatPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { PublicProfilePage } from './pages/profile/PublicProfilePage';
import { ChatsPage } from './pages/chats/ChatsPage';
import { GalleryPage } from './pages/gallery/GalleryPage';
import { GuidesPage } from './pages/guides/GuidesPage';
import { ArticlesPage } from './pages/articles/ArticlesPage';
import { ArticleEditorPage } from './pages/articles/ArticleEditorPage';
import { PricingPage } from './pages/legal/PricingPage';
import { OfferPage } from './pages/legal/OfferPage';
import { ContactsPage } from './pages/legal/ContactsPage';
import { ToolsPage } from './pages/tools/ToolsPage';

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

  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search, location.hash]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Catalog routes */}
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/tools/:slug" element={<CatalogDetailPage type="tool" />} />
        <Route path="/models" element={<CatalogListPage type="model" />} />
        <Route path="/models/chats" element={<ModelPublicChatsPage />} />
        <Route path="/models/:slug" element={<CatalogDetailPage type="model" />} />
        <Route path="/packs" element={<CatalogListPage type="prompt_pack" />} />
        <Route path="/packs/:slug" element={<CatalogDetailPage type="prompt_pack" />} />
        <Route path="/agents" element={<CatalogListPage type="business_agent" />} />
        <Route path="/agents/:agentId/chats" element={<AgentPublicChatsPage />} />
        <Route path="/agents/:slug" element={<CatalogDetailPage type="business_agent" />} />
        <Route path="/local" element={<CatalogListPage type="local_build" />} />
        <Route path="/local/:slug" element={<CatalogDetailPage type="local_build" />} />
        <Route path="/assets" element={<CatalogListPage type="developer_asset" />} />
        <Route path="/assets/:slug" element={<CatalogDetailPage type="developer_asset" />} />
        <Route path="/stacks" element={<CatalogListPage type="stack_preset" />} />
        <Route path="/stacks/:slug" element={<CatalogDetailPage type="stack_preset" />} />
        <Route path="/guides" element={<GuidesPage />} />
        <Route path="/guides/:slug" element={<ArticleDetailPage />} />
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path="/articles/new" element={
          <ProtectedRoute>
            <ArticleEditorPage />
          </ProtectedRoute>
        } />
        <Route path="/articles/edit/:id" element={
          <ProtectedRoute>
            <ArticleEditorPage />
          </ProtectedRoute>
        } />
        <Route path="/articles/:slug" element={<ArticleDetailPage />} />
        <Route path="/article/:slug" element={<ArticleDetailPage />} />

        {/* News routes */}
        <Route path="/news" element={<NewsListPage />} />
        <Route path="/news/:slug" element={<NewsDetailPage />} />
        <Route path="/milestones" element={<MilestonesPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/offer" element={<OfferPage />} />
        <Route path="/contacts" element={<ContactsPage />} />

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
        <Route path="/u/:username" element={<PublicProfilePage />} />

        {/* Shared chat (public, no auth) */}
        <Route path="/shared/chat/:token" element={<SharedChatPage />} />
        <Route path="/shared/chats/:token" element={<SharedChatPage />} />

        {/* Compare */}
        <Route path="/compare" element={<PlaceholderPage title="Сравнение" />} />

        {/* Backward-compatible route */}
        <Route path="/russian-market" element={<CatalogListPage title="Статьи" articleMode />} />

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
          path="/admin/settings"
          element={
            <ProtectedRoute requireAdmin>
              <AdminSettingsPage />
            </ProtectedRoute>
          }
        />
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
          path="/admin/dashboard"
          element={
            <ProtectedRoute requireAdmin>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/charts"
          element={
            <ProtectedRoute requireAdmin>
              <AdminChartsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/articles"
          element={
            <ProtectedRoute requireAdmin>
              <AdminArticlesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/articles/new"
          element={
            <ProtectedRoute requireAdmin>
              <AdminArticleFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/articles/:id"
          element={
            <ProtectedRoute requireAdmin>
              <AdminArticleFormPage />
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
          path="/admin/tools"
          element={
            <ProtectedRoute requireAdmin>
              <AdminToolsPage />
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
        <Route
          path="/admin/runtimes"
          element={
            <ProtectedRoute requireAdmin>
              <AdminRuntimesPage />
            </ProtectedRoute>
          }
        />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

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

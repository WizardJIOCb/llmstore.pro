import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/home/HomePage';
import { CatalogListPage } from './pages/catalog/CatalogListPage';
import { CatalogDetailPage } from './pages/catalog/CatalogDetailPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { AdminCatalogListPage } from './pages/admin/AdminCatalogListPage';
import { AdminCatalogFormPage } from './pages/admin/AdminCatalogFormPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StackBuilderPage } from './pages/builder/StackBuilderPage';
import { SavedStacksPage } from './pages/builder/SavedStacksPage';
import { SavedStackDetailPage } from './pages/builder/SavedStackDetailPage';

export function App() {
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

        {/* Builder routes */}
        <Route path="/builder/stack" element={<StackBuilderPage />} />
        <Route path="/builder/agent" element={<PlaceholderPage title="Конструктор агента" />} />
        <Route path="/builder/agent/:id" element={<PlaceholderPage title="Редактор агента" />} />
        <Route path="/playground/agent/:id" element={<PlaceholderPage title="Площадка агента" />} />

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
        <Route path="/dashboard/agents" element={<PlaceholderPage title="Мои агенты" />} />
        <Route path="/dashboard/runs" element={<PlaceholderPage title="История запусков" />} />
        <Route path="/dashboard/costs" element={<PlaceholderPage title="Затраты" />} />

        {/* Admin routes */}
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

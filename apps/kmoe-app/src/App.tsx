import { lazy, Suspense, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './layouts/AppLayout'
import { EmptyState } from './components/EmptyState'
import { HomePage } from './pages/HomePage'
import { useNativeChapterCacheSync } from './hooks/useNativeChapterCacheSync'
import { useNativeReadingProgressSync } from './hooks/useNativeReadingProgressSync'
import { useNativeShelfSync } from './hooks/useNativeShelfSync'
import { invokeOptional, isTauriRuntime } from './platform/tauri'

const browserBasename = import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL : '/'
const SearchPage = lazy(() => import('./pages/SearchPage').then((module) => ({ default: module.SearchPage })))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage').then((module) => ({ default: module.CategoriesPage })))
const ShelfPage = lazy(() => import('./pages/ShelfPage').then((module) => ({ default: module.ShelfPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const DetailPage = lazy(() => import('./pages/DetailPage').then((module) => ({ default: module.DetailPage })))
const DownloadCenterPage = lazy(() => import('./pages/DownloadCenterPage').then((module) => ({ default: module.DownloadCenterPage })))
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const ReaderPage = lazy(() => import('./pages/ReaderPage').then((module) => ({ default: module.ReaderPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
})

export function App() {
  useNativeShelfSync()
  useNativeChapterCacheSync()
  useNativeReadingProgressSync()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={browserBasename}>
        <TauriDeepLinkRouteListener />
        <Suspense fallback={<RouteLoadingState />}>
          <Routes>
            <Route path="reader/cache/:chapterCacheId" element={<ReaderPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="index.html" element={<HomePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="shelf" element={<ShelfPage />} />
              <Route path="comic/:comicId" element={<DetailPage />} />
              <Route path="downloads" element={<DownloadCenterPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function TauriDeepLinkRouteListener() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isTauriRuntime()) return undefined

    let disposed = false
    let unlisten: (() => void) | undefined
    const openRoute = (route: unknown) => {
      if (typeof route === 'string' && route.startsWith('/comic/')) navigate(route)
    }

    void invokeOptional<string>('get_pending_deep_link_route').then(openRoute)
    openRoute(readAndroidPendingDeepLinkRoute())
    const handleAndroidRoute = (event: Event) => openRoute((event as CustomEvent).detail)
    window.addEventListener('kmoelite-android-deep-link-route', handleAndroidRoute)
    void listen<string>('kmoelite-deep-link-route', (event) => openRoute(event.payload)).then((dispose) => {
      if (disposed) {
        dispose()
        return
      }
      unlisten = dispose
    }).catch(() => {})

    return () => {
      disposed = true
      window.removeEventListener('kmoelite-android-deep-link-route', handleAndroidRoute)
      unlisten?.()
    }
  }, [navigate])

  return null
}

function readAndroidPendingDeepLinkRoute(): string | undefined {
  const bridge = (window as Window & {
    KmoeliteAndroidApp?: {
      takePendingRoute?: () => string
    }
  }).KmoeliteAndroidApp
  try {
    if (typeof bridge?.takePendingRoute === 'function') return bridge.takePendingRoute() || undefined
    return (window as Window & { __kmoeliteAndroidPendingRoute?: string }).__kmoeliteAndroidPendingRoute
  } catch {
    return (window as Window & { __kmoeliteAndroidPendingRoute?: string }).__kmoeliteAndroidPendingRoute
  }
}

function RouteLoadingState() {
  return (
    <main className="mobile-content-safe min-h-dvh px-[var(--page-padding)] py-6 text-[var(--app-fg)]">
      <EmptyState title="正在打开页面">正在加载客户端模块。</EmptyState>
    </main>
  )
}

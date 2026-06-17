import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookMarked, BookOpen, Download, Home, Library, Menu, Search, Settings, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { useNativeAppConfigSync } from '../hooks/useNativeAppConfigSync'
import { usePlatformLayoutModel } from '../hooks/useLayoutMode'
import { PageTransition } from '../components/motion/PageTransition'
import { moveSpatialFocus } from '../lib/spatialFocus'

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/shelf', label: '书架', icon: BookMarked },
  { to: '/search', label: '搜索', icon: Search },
  { to: '/categories', label: '分类', icon: SlidersHorizontal },
  { to: '/downloads', label: '下载', icon: Download },
  { to: '/library', label: '资料库', icon: Library },
  { to: '/account', label: '我的', icon: UserRound },
  { to: '/settings', label: '设置', icon: Settings }
]

const navGroups = [
  { label: '浏览', items: navItems.slice(0, 4) },
  { label: '本地', items: navItems.slice(4, 6) },
  { label: '账户', items: navItems.slice(6) }
]

const mobileNavItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/shelf', label: '书架', icon: BookMarked },
  { to: '/downloads', label: '下载', icon: Download },
  { to: '/library', label: '资料库', icon: Library }
]

const mobileMoreItems = [
  { to: '/search', label: '搜索', icon: Search },
  { to: '/account', label: '我的账号', icon: UserRound },
  { to: '/categories', label: '分类', icon: SlidersHorizontal },
  { to: '/settings', label: '设置', icon: Settings }
]

export function AppLayout() {
  useNativeAppConfigSync()
  const layoutModel = usePlatformLayoutModel()
  const { deviceClass, inputClass, layoutContract, layoutMode, runtimeClass, windowClass } = layoutModel
  const navigate = useNavigate()
  const location = useLocation()
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const moreActive = mobileMoreItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
  const phoneLayout = layoutMode === 'phone'
  const desktopLayout = layoutMode === 'desktop'
  const sidebarLayout = !phoneLayout
  const shellGridClass = layoutMode === 'desktop'
    ? 'grid-cols-[200px_1fr]'
    : layoutMode === 'tablet'
      ? 'grid-cols-[92px_1fr]'
      : layoutMode === 'tabletCompact'
        ? 'grid-cols-[76px_1fr]'
        : 'grid-cols-1'
  const shellViewportClass = 'h-dvh overflow-hidden'
  const platformClass = [
    `platform-${layoutMode}`,
    `layout-${layoutContract}`,
    `device-${deviceClass}`,
    `window-${windowClass}`,
    `input-${inputClass}`,
    `runtime-${runtimeClass}`,
    layoutMode === 'tablet' || layoutMode === 'tabletCompact' ? 'platform-tablet' : '',
    layoutMode === 'tabletCompact' ? 'platform-tablet-compact' : ''
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (!phoneLayout) return undefined
    const scroller = mainScrollRef.current
    if (!scroller) return undefined

    const clampHorizontalScroll = () => {
      if (scroller.scrollLeft !== 0) scroller.scrollLeft = 0
      if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0
      if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY)
    }

    clampHorizontalScroll()
    scroller.addEventListener('scroll', clampHorizontalScroll, { passive: true })
    window.addEventListener('resize', clampHorizontalScroll)
    return () => {
      scroller.removeEventListener('scroll', clampHorizontalScroll)
      window.removeEventListener('resize', clampHorizontalScroll)
    }
  }, [phoneLayout, location.pathname, location.search])

  useEffect(() => {
    if (phoneLayout) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      moveSpatialFocus(event)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phoneLayout])

  return (
    <div
      className={`${platformClass} ${shellViewportClass} text-[var(--app-fg)]`}
      data-layout-mode={layoutMode}
      data-layout-contract={layoutContract}
      data-device-class={deviceClass}
      data-window-class={windowClass}
      data-input-class={inputClass}
      data-runtime-class={runtimeClass}
    >
      <div className={`grid ${shellViewportClass} ${shellGridClass}`}>
        {sidebarLayout ? (
        <aside className="glass-sidebar app-sidebar flex flex-col">
          <button className={`app-sidebar-brand flex items-center gap-3 text-left ${desktopLayout ? 'px-4' : 'px-3'}`} onClick={() => navigate('/')} aria-label="返回首页">
            <div className="app-sidebar-logo grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--app-fg)] text-[var(--app-bg)] shadow-[var(--app-glow)]">
              <BookOpen className="h-5 w-5" />
            </div>
            {desktopLayout ? <div className="min-w-0">
              <div className="truncate text-sm font-bold">Kmoe Client</div>
              <div className="truncate text-[11px] font-medium text-[var(--app-muted)]">书架 · 阅读 · 下载</div>
            </div> : null}
          </button>
          <nav className="app-sidebar-nav flex flex-1 flex-col gap-4 px-2.5 py-2">
            {(desktopLayout ? navGroups : [{ label: '', items: navItems }]).map((group) => (
              <div key={group.label || 'compact'} className="grid gap-1.5">
                {desktopLayout ? <div className="app-sidebar-group-label px-2 text-[10px] font-bold uppercase text-[var(--app-muted)]">{group.label}</div> : null}
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      `app-sidebar-link pressable flex min-h-10 items-center ${desktopLayout ? 'justify-start' : 'justify-center'} gap-2.5 rounded-2xl px-2.5 text-sm font-semibold transition ${
                        isActive ? 'tab-pill' : 'text-[var(--app-muted)] hover:bg-[var(--app-glass)] hover:text-[var(--app-fg)]'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {desktopLayout ? <span>{item.label}</span> : null}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        ) : null}

        <div className="app-main-shell flex min-h-0 min-w-0 flex-col">
          <main ref={mainScrollRef} className={`app-scrollbar min-h-0 flex-1 overflow-y-auto px-[var(--page-padding)] pt-4 ${phoneLayout ? 'pb-4' : 'pb-8'}`}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
          {phoneLayout ? (
          <nav className="floating-tabbar phone-bottom-nav z-20 grid grid-cols-5">
            {mobileNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMoreOpen(false)}
                className={({ isActive }) => `mobile-tab-item pressable flex flex-col items-center justify-center gap-1 font-semibold transition ${isActive ? 'tab-pill' : 'text-[var(--app-muted)]'}`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              aria-controls="mobile-more-navigation"
              aria-expanded={mobileMoreOpen}
              className={`mobile-tab-item pressable flex flex-col items-center justify-center gap-1 font-semibold transition ${mobileMoreOpen || moreActive ? 'tab-pill' : 'text-[var(--app-muted)]'}`}
              onClick={() => setMobileMoreOpen((open) => !open)}
            >
              {mobileMoreOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              更多
            </button>
          </nav>
          ) : null}
        </div>
      </div>

      {phoneLayout && mobileMoreOpen ? (
        <nav id="mobile-more-navigation" className="mobile-more-sheet glass-panel sheet-enter fixed left-4 right-4 z-30 rounded-[28px] p-3 shadow-[var(--app-shadow-floating)] md:hidden" aria-label="移动端更多导航">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full subtle-fill" />
          <div className="grid grid-cols-2 gap-2">
            {mobileMoreItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMoreOpen(false)}
                className={({ isActive }) =>
                  `pressable flex min-h-12 items-center gap-2 rounded-2xl px-3 text-sm font-semibold ${
                    isActive ? 'tab-pill' : 'border border-[var(--app-border)] bg-[var(--app-glass)] text-[var(--app-muted)]'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  )
}

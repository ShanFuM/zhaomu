import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Plus, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { applyMode, getSavedMode } from '../lib/appearance'
import TabBar from './TabBar'

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isTimeline = pathname === '/timeline'
  const isAlbum = pathname === '/album'
  const showFab = isTimeline || isAlbum

  useEffect(() => {
    const sync = () => applyMode(getSavedMode())
    sync()

    const timer = window.setInterval(sync, 60_000)
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return (
    <>
      <div className="app">
        <div className="page" key={pathname}>
          <header className="topbar">
            <Link to="/" className="brand" aria-label="朝暮 首页">
              <span className="brand-mark" aria-hidden />
              <span className="brand-name">朝暮</span>
            </Link>
            <Link to="/settings" className="icon-btn" aria-label="设置">
              <Settings size={20} strokeWidth={1.7} />
            </Link>
          </header>
          {children}
        </div>
        <TabBar />
      </div>
      {showFab && (
        <button
          className="fab"
          aria-label={isAlbum ? '添加照片' : '写一条记录'}
          onClick={() =>
            window.dispatchEvent(
              new Event(isAlbum ? 'zhaomu:add-photo' : 'zhaomu:add-entry'),
            )
          }
        >
          <Plus size={24} />
        </button>
      )}
    </>
  )
}

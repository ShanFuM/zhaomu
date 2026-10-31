import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AppShell from './components/AppShell'
import Album from './pages/Album'
import AuthPage from './pages/AuthPage'
import Home from './pages/Home'
import Mailbox from './pages/Mailbox'
import Settings from './pages/Settings'
import Timeline from './pages/Timeline'
import Wishes from './pages/Wishes'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="splash">正在打开朝暮…</div>
  if (!user) return <AuthPage />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/album" element={<Album />} />
        <Route path="/mailbox" element={<Mailbox />} />
        <Route path="/wishes" element={<Wishes />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  )
}

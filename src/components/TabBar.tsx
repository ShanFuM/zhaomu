import { BookOpen, Home, Images, ListChecks, Mail } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/timeline', label: '时间轴', icon: BookOpen },
  { to: '/album', label: '相册', icon: Images },
  { to: '/mailbox', label: '信箱', icon: Mail },
  { to: '/wishes', label: '愿望', icon: ListChecks },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="主导航">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `tab${isActive ? ' on' : ''}`}
        >
          <Icon size={21} strokeWidth={1.7} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: '邮箱或密码不对',
  invalid_setup_code: '初始化码不对',
  already_setup: '已经初始化过了，刷新页面直接登录',
  weak_password: '密码至少 8 位',
  invalid_email: '邮箱格式不对',
  duplicate_email: '两个邮箱不能一样',
  invalid_name: '名字不能为空，最多 20 个字',
  need_two_users: '需要创建两个账号',
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return ERROR_TEXT[error.message] ?? `出错了（${error.message}）`
  }
  return '连不上服务器，请确认本地服务已启动'
}

export default function AuthPage() {
  const { setUser } = useAuth()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [code, setCode] = useState('zhaomu-setup')
  const [me, setMe] = useState({ name: '', email: '', password: '' })
  const [her, setHer] = useState({ name: '', email: '', password: '' })

  useEffect(() => {
    let alive = true
    api
      .status()
      .then((result) => {
        if (alive) setNeedsSetup(result.needsSetup)
      })
      .catch(() => {
        if (alive) setError('连不上服务器，请确认本地服务已启动')
      })
      .finally(() => {
        if (alive) setChecking(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const result = needsSetup
        ? await api.setup({ code, users: [me, her] })
        : await api.login({ email, password })
      setUser(result.user)
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return <div className="splash">正在打开朝暮…</div>
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">朝暮</span>
      </div>

      <div className="auth-head">
        <h1>{needsSetup ? '先建好我们的小屋' : '回来啦'}</h1>
        <p>
          {needsSetup
            ? '创建两个账号，之后用邮箱和密码登录。'
            : '只属于我们两个人的记录。'}
        </p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        {needsSetup ? (
          <>
            <fieldset>
              <legend>你</legend>
              <label className="field">
                <span>名字</span>
                <input
                  value={me.name}
                  maxLength={20}
                  autoComplete="nickname"
                  placeholder="怎么称呼你"
                  onChange={(event) =>
                    setMe({ ...me, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={me.email}
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(event) =>
                    setMe({ ...me, email: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>密码</span>
                <input
                  type="password"
                  value={me.password}
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  onChange={(event) =>
                    setMe({ ...me, password: event.target.value })
                  }
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>她</legend>
              <label className="field">
                <span>名字</span>
                <input
                  value={her.name}
                  maxLength={20}
                  placeholder="她的名字"
                  onChange={(event) =>
                    setHer({ ...her, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={her.email}
                  autoCapitalize="none"
                  placeholder="her@example.com"
                  onChange={(event) =>
                    setHer({ ...her, email: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>密码</span>
                <input
                  type="password"
                  value={her.password}
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  onChange={(event) =>
                    setHer({ ...her, password: event.target.value })
                  }
                />
              </label>
            </fieldset>

            <label className="field">
              <span>初始化码</span>
              <input
                value={code}
                autoCapitalize="none"
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <p className="auth-hint">
              本地默认 zhaomu-setup；部署后把 SETUP_CODE 换成只有你们知道的词。
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>邮箱</span>
              <input
                type="email"
                value={email}
                autoCapitalize="none"
                autoComplete="username"
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                placeholder="输入密码"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-primary" disabled={busy}>
          {busy ? '请稍候…' : needsSetup ? '创建并进入' : '进入朝暮'}
        </button>
      </form>

      <p className="auth-footer">只有我们两个人能看见</p>
    </div>
  )
}

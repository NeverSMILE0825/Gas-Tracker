'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { parseProbe } from '@gasscope/shared'
import { Activity, Bell, Blocks, Compass, Gauge, History, Search, Settings, Waypoints } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { entityHref, useGasQuery } from '@/lib/query-state'

const LINKS = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/why', label: 'Why Gas Changed', icon: Waypoints },
  { href: '/drivers', label: 'Top Drivers', icon: Activity },
  { href: '/blocks', label: 'Block Explorer', icon: Blocks },
  { href: '/history', label: 'Historical Analysis', icon: History },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/methodology', label: 'Sources & Methodology', icon: Compass },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { search } = useGasQuery()
  useEffect(() => {
    if (localStorage.getItem('gasscope-theme') === 'graphite') document.documentElement.dataset.theme = 'graphite'
  }, [])
  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="shell">
        <aside className="side">
          <Link href={`/${search}`} className="brand">
            <span className="mark">G</span>
            <span>
              <strong className="block text-lg leading-none">GasScope</strong>
              <span className="text-xs text-muted">Execution gas intelligence</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Primary">
            {LINKS.map((link) => {
              const Icon = link.icon
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
              return (
                <Link key={link.href} href={`${link.href}${search}`} className="nav-link" data-active={active}>
                  <Icon size={16} /> {link.label}
                </Link>
              )
            })}
          </nav>
        </aside>
        <div className="main">
          <Header />
          {children}
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile">
        {LINKS.map((link) => (
          <Link key={link.href} href={`${link.href}${search}`} className="nav-link whitespace-nowrap" data-active={link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)}>
            {link.label}
          </Link>
        ))}
      </nav>
    </Tooltip.Provider>
  )
}

function Header() {
  const router = useRouter()
  const { search } = useGasQuery()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        document.getElementById('probe')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <form
      className="topbar"
      onSubmit={(event) => {
        event.preventDefault()
        const probe = parseProbe(value)
        if (probe.kind === 'invalid') {
          setError(probe.reason)
          return
        }
        setError(null)
        const path = probe.kind === 'tx' ? entityHref('tx', probe.hash, search) : probe.kind === 'address' ? entityHref('address', probe.address, search) : entityHref('block', probe.number, search)
        router.push(path)
      }}
    >
      <label className="search">
        <Search size={16} />
        <input id="probe" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Address, tx hash, block, or Etherscan URL" aria-label="Investigate an address, transaction, or block" />
      </label>
      {error ? <span className="text-xs text-[#fb7185]">{error}</span> : <span className="hidden text-xs text-muted md:inline">Press / to search</span>}
    </form>
  )
}

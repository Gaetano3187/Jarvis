import Link from 'next/link'
import { useRouter } from 'next/router'

const links = [
  { href: '/home',              label: 'Home' },
  { href: '/dashboard',         label: 'Dashboard' },       // etichetta corretta
  { href: '/liste-prodotti',    label: 'Liste Prodotti' },  // slug corretto
  { href: '/finanze',           label: 'Finanze' },
  { href: '/spese-casa',        label: 'Casa' },
  { href: '/vestiti-ed-altro',  label: 'Vestiti' },
  { href: '/cene-aperitivi',    label: 'Cene' },
  { href: '/varie',             label: 'Varie' },
]

export default function NavBar() {
  const { pathname } = useRouter()

  return (
    <nav style={{ width: '100%', background: '#0f172a', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: '64px', padding: '0 1rem', overflowX: 'auto' }}>
        <img
          src="https://aheioqhobo.cloudimg.io/v7/_playground-bucket-v2.teleporthq.io_/84ec08e8-34e9-42c7-9445-d2806d156403/fac575ac-7a41-484f-b7ac-875042de11f8?org_if_sml=1&force_format=original"
          alt="Jarvis"
          style={{ height: '32px', marginRight: '1.5rem', flexShrink: 0 }}
        />

        {/* link orizzontali */}
        <ul style={{ display: 'flex', gap: '1.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
          {links.map(({ href, label }) => (
            <li key={href} style={{ whiteSpace: 'nowrap' }}>
              <Link
                href={href}
                style={{
                  color: pathname === href ? '#facc15' : '#f1f5f9',
                  fontWeight: pathname === href ? 600 : 400,
                  textDecoration: 'none',
                }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

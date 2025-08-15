// pages/_app.js
import '@/styles/globals.css'        // se già presente
import '../styles/responsive.css';
import { useRouter } from 'next/router'

export default function MyApp({ Component, pageProps }) {
  const router = useRouter()
  return (
    <div data-route={router.pathname}>
      <Component {...pageProps} />
    </div>
  )
}

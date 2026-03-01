// hoc/withAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

const withAuth = (WrappedComponent) => {
  const WithAuthComponent = (props) => {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    useEffect(() => {
      if (mounted && !loading && !user) {
        router.replace('/login');
      }
    }, [user, loading, router, mounted]);

    // Durante SSR/prerender restituisce un div vuoto (non null)
    // per evitare "Element type is invalid"
    if (!mounted || loading) {
      return <div style={{ minHeight: '100vh', background: '#07090c' }} />;
    }

    if (!user) return null;

    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithAuthComponent;
};

export default withAuth;
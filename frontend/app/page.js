'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login');
    if (user.mustChangePassword) return router.replace('/set-password');
    router.replace(user.role === 'super_admin' ? '/internal-onboarding' : '/dashboard');
  }, [loading, user, router]);

  return null;
}

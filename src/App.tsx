import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { Navbar } from './components/layout/Navbar.tsx';
import { OverviewView } from './components/dashboard/OverviewView.tsx';
import { SecurityEventsView } from './components/events/SecurityEventsView.tsx';
import { UserAdminView } from './components/admin/UserAdminView.tsx';
import { ApiDocsView } from './components/docs/ApiDocsView.tsx';
import { Shield } from 'lucide-react';

function MainApp() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<'overview' | 'events' | 'admin' | 'docs'>('overview');

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 space-y-4">
        <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 animate-pulse">
          <Shield className="h-5 w-5" />
        </div>
        <div className="text-xs font-mono text-zinc-500">Initializing NetGuard Security Console...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  // Guard against non-admin manually selecting admin tab
  const handleSelectTab = (tab: 'overview' | 'events' | 'admin' | 'docs') => {
    if (tab === 'admin' && user.role !== 'ADMIN') {
      setCurrentTab('overview');
      return;
    }
    setCurrentTab(tab);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-zinc-800 selection:text-zinc-100">
      <Navbar currentTab={currentTab} onSelectTab={handleSelectTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentTab === 'overview' && (
          <OverviewView onNavigate={handleSelectTab} />
        )}

        {currentTab === 'events' && (
          <SecurityEventsView />
        )}

        {currentTab === 'admin' && user.role === 'ADMIN' && (
          <UserAdminView />
        )}

        {currentTab === 'docs' && (
          <ApiDocsView />
        )}
      </main>

      <footer className="border-t border-zinc-800/80 py-4 text-center text-xs text-zinc-600 font-mono">
        NetGuard V0 &mdash; Snort Telemetry Management & RBAC Console
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

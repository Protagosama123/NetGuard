import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Shield, Activity, Users, FileCode2, LogOut, ShieldAlert } from 'lucide-react';

export interface NavbarProps {
  currentTab: 'overview' | 'events' | 'admin' | 'docs';
  onSelectTab: (tab: 'overview' | 'events' | 'admin' | 'docs') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { user, logout } = useAuth();
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (mounted) {
          setBackendHealthy(res.ok);
        }
      } catch {
        if (mounted) {
          setBackendHealthy(false);
        }
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const getRoleBadgeVariant = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'destructive';
      case 'ANALYST':
        return 'info';
      case 'VIEWER':
      default:
        return 'secondary';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Brand & Left Navigation */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => onSelectTab('overview')}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-100 shadow-sm">
              <Shield className="h-4 w-4 text-zinc-200" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold tracking-tight text-zinc-100 text-sm">NetGuard</span>
              <span className="text-[10px] font-mono text-zinc-500 uppercase px-1 py-0.2 bg-zinc-900 border border-zinc-800 rounded">V0</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => onSelectTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'overview'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => onSelectTab('events')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'events'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Security Events</span>
            </button>

            {/* Role-Protected Admin Tab */}
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => onSelectTab('admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  currentTab === 'admin'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Administration</span>
              </button>
            )}

            <button
              onClick={() => onSelectTab('docs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'docs'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>API Specs</span>
            </button>
          </nav>
        </div>

        {/* Right User & System Status */}
        <div className="flex items-center gap-3">
          {/* Health indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 px-2.5 py-1 rounded-full bg-zinc-900/60 border border-zinc-800">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                backendHealthy === true
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : backendHealthy === false
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                  : 'bg-zinc-500'
              }`}
            />
            <span>{backendHealthy ? 'TELEMETRY LIVE' : 'CONNECTING'}</span>
          </div>

          {/* User & Role Badge */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-medium text-zinc-200 truncate max-w-[140px]">
                  {user.email}
                </span>
              </div>
              <Badge variant={getRoleBadgeVariant(user.role)}>
                {user.role}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-8 px-2 text-zinc-400 hover:text-zinc-100"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

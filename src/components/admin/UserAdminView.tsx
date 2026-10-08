import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Alert } from '../ui/alert.tsx';
import { Users, UserPlus, Shield, RefreshCw, CheckCircle, AlertCircle, Lock, X } from 'lucide-react';
import type { UserRole } from '../../types/auth.ts';

export const UserAdminView: React.FC = () => {
  const { token, user: currentUser, refreshProfile } = useAuth();
  const [userList, setUserList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Operator Modal
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setActionError(null);
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUserList(json.data || []);
        }
      } else {
        const json = await res.json();
        setActionError(json.error || 'Failed to fetch operators list');
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (targetUserId: number, newRole: UserRole) => {
    if (!token) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/users/${targetUserId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || 'Failed to update role');
        return;
      }

      setActionSuccess(`Successfully updated role to ${newRole}`);
      fetchUsers();
      if (targetUserId === currentUser?.id) {
        refreshProfile();
      }
    } catch (err: any) {
      setActionError(err.message || 'Network error updating role');
    }
  };

  const handleStatusToggle = async (targetUserId: number, currentActive: boolean) => {
    if (!token) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/users/${targetUserId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || 'Failed to update status');
        return;
      }

      setActionSuccess(`Account ${!currentActive ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (err: any) {
      setActionError(err.message || 'Network error updating status');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setNewError('Password must be at least 8 characters in length');
      return;
    }
    setNewSubmitting(true);
    setNewError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setNewError(json.error || 'Failed to register operator');
        return;
      }

      setIsAddUserOpen(false);
      setNewEmail('');
      setNewPassword('');
      setActionSuccess(`New operator ${json.data.user.email} created.`);
      fetchUsers();
    } catch (err: any) {
      setNewError(err.message || 'Network error creating operator');
    } finally {
      setNewSubmitting(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-400" />
            Operator Access & RBAC Administration
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Role-Based Authorization enforcement: ADMIN &bull; ANALYST &bull; VIEWER
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddUserOpen(true)}
            className="text-xs flex items-center gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add Operator</span>
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive" className="py-2.5 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </Alert>
      )}

      {actionSuccess && (
        <Alert variant="success" className="py-2.5 text-xs flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </Alert>
      )}

      {/* Users Directory Table */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-semibold text-zinc-200">
            System Operators Directory ({userList.length})
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Assigned roles and active authorization states.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Operator ID</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-right">Role Controls</th>
                  <th className="py-3 px-4 text-right">Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-500 font-mono">
                      Loading user accounts...
                    </td>
                  </tr>
                ) : userList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      No user accounts found.
                    </td>
                  </tr>
                ) : (
                  userList.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr key={u.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-zinc-400">
                          #{u.id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-zinc-200 font-mono">
                            {u.email}
                          </div>
                          {isSelf && (
                            <span className="text-[10px] text-zinc-500 uppercase font-mono">
                              (Current Session)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge variant={getRoleBadgeVariant(u.role)}>
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {u.isActive ? (
                            <Badge variant="success">ACTIVE</Badge>
                          ) : (
                            <Badge variant="destructive">DEACTIVATED</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                          {new Date(u.createdAt).toISOString().split('T')[0]}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="ANALYST">ANALYST</option>
                            <option value="VIEWER">VIEWER</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button
                            variant={u.isActive ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => handleStatusToggle(u.id, u.isActive)}
                            className={`h-7 px-2.5 text-xs ${
                              u.isActive
                                ? 'text-red-400 hover:text-red-300 hover:bg-red-950/40 border-zinc-800'
                                : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Operator Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100">
            <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
              <div>
                <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-sky-400" />
                  Onboard New Operator
                </h2>
                <p className="text-xs text-zinc-400">
                  Create a new operator account. Roles can be adjusted subsequently.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsAddUserOpen(false)}
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 -mr-2 -mt-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              {newError && (
                <Alert variant="destructive" className="py-2.5 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{newError}</span>
                </Alert>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-zinc-400">Operator Email*</label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="analyst@netguard.local"
                  required
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-zinc-400">Temporary Password*</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="text-xs"
                />
                <p className="text-[11px] text-zinc-500">Minimum 8 characters</p>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddUserOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={newSubmitting}
                  className="text-xs"
                >
                  {newSubmitting ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

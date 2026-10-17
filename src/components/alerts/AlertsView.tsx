import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { AlertDetailModal } from './AlertDetailModal.tsx';
import {
  Bell,
  Search,
  Filter,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import type { AlertSeverity, AlertStatus } from '../../db/schema.ts';

export const AlertsView: React.FC = () => {
  const { token, user } = useAuth();

  // Data & Pagination
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [sourceIpFilter, setSourceIpFilter] = useState<string>('');

  // Modals & Action Notifications
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setActionError(null);

      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));

      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter) params.append('severity', severityFilter);
      if (sourceIpFilter.trim()) params.append('sourceIp', sourceIpFilter.trim());

      const res = await fetch(`/api/alerts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAlertsList(json.data || []);
          if (json.pagination) {
            setTotalCount(json.pagination.total);
            setTotalPages(json.pagination.totalPages);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [token, page, limit, search, statusFilter, severityFilter, sourceIpFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleStatusChange = async (alertId: number, newStatus: AlertStatus) => {
    if (!token) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/alerts/${alertId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || 'Failed to update alert status');
        return;
      }

      setActionSuccess(`Alert #${alertId} updated to ${newStatus}`);
      fetchAlerts();
      if (selectedAlert?.id === alertId) {
        setSelectedAlert((prev: any) => (prev ? { ...prev, status: newStatus } : null));
      }
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Network error updating alert status');
    }
  };

  const handleInspectAlert = async (alertId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSelectedAlert(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch alert detail:', err);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSeverityFilter('');
    setSourceIpFilter('');
    setPage(1);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="destructive">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="destructive">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning">MEDIUM</Badge>;
      case 'LOW':
      default:
        return <Badge variant="info">LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return <Badge variant="destructive">NEW</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge variant="success">RESOLVED</Badge>;
      case 'DISMISSED':
      default:
        return <Badge variant="secondary">DISMISSED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400" />
            Alert Triage & Operations
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Actionable items derived from Snort telemetry &bull; {totalCount} total alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAlerts}
            disabled={loading}
            className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60"
            title="Refresh alerts"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-md text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-md text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <Card className="bg-zinc-900/30">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search alert title or context..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 text-xs font-mono"
              />
            </div>

            {/* Status Selector */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">All Statuses</option>
                <option value="NEW">NEW</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>

            {/* Severity Selector */}
            <div>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            {/* Reset */}
            <div className="flex gap-2">
              <Input
                placeholder="Filter Source IP"
                value={sourceIpFilter}
                onChange={(e) => {
                  setSourceIpFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleResetFilters}
                className="shrink-0 h-9 w-9 text-zinc-400 hover:text-zinc-100"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">SID</th>
                  <th className="py-3 px-4">Alert Title</th>
                  <th className="py-3 px-4">Traffic Vector (Src &rarr; Dst)</th>
                  <th className="py-3 px-4">Detected</th>
                  <th className="py-3 px-4 text-right">Quick Triage</th>
                  <th className="py-3 px-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                      Loading operational alerts...
                    </td>
                  </tr>
                ) : alertsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center space-y-2">
                      <p className="text-zinc-400">No alerts match the active filters.</p>
                      <Button variant="outline" size="sm" onClick={handleResetFilters} className="text-xs">
                        Clear Filters
                      </Button>
                    </td>
                  </tr>
                ) : (
                  alertsList.map((alertItem) => (
                    <tr key={alertItem.id} className="hover:bg-zinc-900/50 transition-colors group">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {getSeverityBadge(alertItem.severity)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getStatusBadge(alertItem.status)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-300 whitespace-nowrap">
                        {alertItem.signatureId}
                      </td>
                      <td className="py-2.5 px-4 max-w-xs sm:max-w-md">
                        <div className="font-medium text-zinc-200 truncate">
                          {alertItem.title}
                        </div>
                        {alertItem.description && (
                          <div className="text-[11px] text-zinc-500 truncate">
                            {alertItem.description}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                        <span className="text-zinc-300">{alertItem.sourceIp}</span>
                        <span className="text-zinc-600 px-1">&rarr;</span>
                        <span className="text-zinc-300">{alertItem.destinationIp}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                        {new Date(alertItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className="text-zinc-600">{new Date(alertItem.createdAt).toISOString().split('T')[0]}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {canManage ? (
                          <div className="inline-flex items-center gap-1.5">
                            {alertItem.status === 'NEW' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(alertItem.id, 'IN_PROGRESS')}
                                  className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 hover:bg-amber-900/80 text-[11px] font-mono cursor-pointer"
                                  title="Acknowledge & start triage"
                                >
                                  Ack
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(alertItem.id, 'DISMISSED')}
                                  className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono cursor-pointer"
                                  title="Dismiss as non-actionable"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                            {alertItem.status === 'IN_PROGRESS' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(alertItem.id, 'RESOLVED')}
                                className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/80 text-[11px] font-mono cursor-pointer"
                                title="Mark alert resolved"
                              >
                                Resolve
                              </button>
                            )}
                            {(alertItem.status === 'RESOLVED' || alertItem.status === 'DISMISSED') && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(alertItem.id, 'IN_PROGRESS')}
                                className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono cursor-pointer"
                                title="Reopen alert"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-600 font-mono">View Only</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInspectAlert(alertItem.id)}
                          className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span>Showing page {page} of {totalPages || 1}</span>
              <span className="text-zinc-600">&bull;</span>
              <span>{totalCount} total alerts</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded border border-zinc-800 bg-zinc-900 px-2 text-xs font-mono text-zinc-300 focus:outline-none"
              >
                <option value="10">10 / page</option>
                <option value="20">20 / page</option>
                <option value="50">50 / page</option>
              </select>

              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <AlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onStatusChange={handleStatusChange}
        canManage={canManage}
      />
    </div>
  );
};

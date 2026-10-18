import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRealtime } from '../../context/RealtimeContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { CreateIncidentModal } from './CreateIncidentModal.tsx';
import { IncidentDetailModal } from './IncidentDetailModal.tsx';
import {
  Flame,
  Search,
  PlusCircle,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  User,
  Link as LinkIcon,
} from 'lucide-react';
import type { IncidentSeverity, IncidentStatus } from '../../db/schema.ts';

export const IncidentsView: React.FC = () => {
  const { token, user } = useAuth();
  const { subscribe } = useRealtime();

  // Data & Pagination
  const [incidentsList, setIncidentsList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  // Modals & Notifications
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const fetchIncidents = useCallback(async () => {
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

      const res = await fetch(`/api/incidents?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setIncidentsList(json.data || []);
          if (json.pagination) {
            setTotalCount(json.pagination.total);
            setTotalPages(json.pagination.totalPages);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  }, [token, page, limit, search, statusFilter, severityFilter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Realtime subscription for live incident updates
  useEffect(() => {
    const unsubscribe = subscribe('*', (msg) => {
      if (
        msg.event === 'incident:created' ||
        msg.event === 'incident:status_changed' ||
        msg.event === 'incident:assigned' ||
        msg.event === 'investigation:entry_added' ||
        msg.event === 'gateway:resync_required'
      ) {
        fetchIncidents();
      }
    });
    return unsubscribe;
  }, [subscribe, fetchIncidents]);

  const handleInspectIncident = async (incidentId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSelectedIncident(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch incident detail:', err);
    }
  };

  const handleStatusChange = async (incidentId: number, newStatus: IncidentStatus, resolutionSummary?: string) => {
    if (!token) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const isResolve = newStatus === 'RESOLVED' || newStatus === 'CLOSED';
      const endpoint = isResolve ? `/api/incidents/${incidentId}/resolve` : `/api/incidents/${incidentId}/status`;
      const body = isResolve
        ? { resolutionSummary, status: newStatus }
        : { status: newStatus };

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || 'Failed to update incident status');
        return;
      }

      setActionSuccess(`Incident #${incidentId} status transitioned to ${newStatus}`);
      fetchIncidents();
      handleInspectIncident(incidentId);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Error updating incident status');
    }
  };

  const handleAssignIncident = async (incidentId: number, assigneeId: number | null) => {
    if (!token) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignedTo: assigneeId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || 'Failed to update assignment');
        return;
      }
      setActionSuccess(`Incident #${incidentId} assignment updated.`);
      fetchIncidents();
      handleInspectIncident(incidentId);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Error updating assignment');
    }
  };

  const handleUnlinkAlert = async (incidentId: number, alertId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}/alerts/${alertId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        handleInspectIncident(incidentId);
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to unlink alert:', err);
    }
  };

  const handleLinkAlerts = async (incidentId: number, alertIds: number[]) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alertIds }),
      });
      if (res.ok) {
        handleInspectIncident(incidentId);
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to link alerts:', err);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSeverityFilter('');
    setPage(1);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV1':
        return <Badge variant="destructive">SEV1 - CRIT</Badge>;
      case 'SEV2':
        return <Badge variant="destructive">SEV2 - HIGH</Badge>;
      case 'SEV3':
        return <Badge variant="warning">SEV3 - MED</Badge>;
      case 'SEV4':
      default:
        return <Badge variant="info">SEV4 - LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="destructive">OPEN</Badge>;
      case 'INVESTIGATING':
        return <Badge variant="warning">INVESTIGATING</Badge>;
      case 'CONTAINED':
        return <Badge variant="info">CONTAINED</Badge>;
      case 'RESOLVED':
        return <Badge variant="success">RESOLVED</Badge>;
      case 'CLOSED':
      default:
        return <Badge variant="secondary">CLOSED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Flame className="h-5 w-5 text-red-400" />
            Security Incident Operations
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Incident response, containment & resolution cases &bull; {totalCount} total cases
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIncidents}
            disabled={loading}
            className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60"
            title="Refresh incidents"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="text-xs flex items-center gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Declare Incident</span>
            </Button>
          )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search incident title, scope, or resolution summary..."
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
                <option value="OPEN">OPEN</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="CONTAINED">CONTAINED</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            {/* Severity Selector */}
            <div className="flex gap-2">
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">All Severities</option>
                <option value="SEV1">SEV1 (Critical)</option>
                <option value="SEV2">SEV2 (High)</option>
                <option value="SEV3">SEV3 (Medium)</option>
                <option value="SEV4">SEV4 (Low)</option>
              </select>

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

      {/* Incidents Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">ID</th>
                  <th className="py-3 px-4">Incident Case Title & Scope</th>
                  <th className="py-3 px-3">Alerts</th>
                  <th className="py-3 px-4">Lead Assignee</th>
                  <th className="py-3 px-4">Declared</th>
                  <th className="py-3 px-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                      Loading security incidents...
                    </td>
                  </tr>
                ) : incidentsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center space-y-2">
                      <p className="text-zinc-400">No security incidents match the active filters.</p>
                      <Button variant="outline" size="sm" onClick={handleResetFilters} className="text-xs">
                        Clear Filters
                      </Button>
                    </td>
                  </tr>
                ) : (
                  incidentsList.map((inc) => (
                    <tr key={inc.id} className="hover:bg-zinc-900/50 transition-colors group">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {getSeverityBadge(inc.severity)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getStatusBadge(inc.status)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-300 whitespace-nowrap">
                        #{inc.id}
                      </td>
                      <td className="py-2.5 px-4 max-w-xs sm:max-w-md">
                        <div className="font-semibold text-zinc-100 truncate">
                          {inc.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {inc.description}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px]">
                          <LinkIcon className="h-3 w-3 text-zinc-500" />
                          {inc.alertCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px]">
                        {inc.assignee ? (
                          <span className="text-zinc-300">{inc.assignee.email}</span>
                        ) : (
                          <span className="text-amber-400 font-sans italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                        {new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className="text-zinc-600">{new Date(inc.createdAt).toISOString().split('T')[0]}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInspectIncident(inc.id)}
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
              <span>{totalCount} total incidents</span>
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

      {/* Modals */}
      <CreateIncidentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => fetchIncidents()}
      />

      <IncidentDetailModal
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onStatusChange={handleStatusChange}
        onAssign={handleAssignIncident}
        onUnlinkAlert={handleUnlinkAlert}
        onLinkAlerts={handleLinkAlerts}
        canManage={canManage}
      />
    </div>
  );
};

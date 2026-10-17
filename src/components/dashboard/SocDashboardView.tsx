import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import {
  Flame,
  Bell,
  ShieldAlert,
  Activity,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  RefreshCw,
  PlusCircle,
  Radio,
} from 'lucide-react';
import type { IncidentSeverity, IncidentStatus, AlertSeverity, AlertStatus } from '../../db/schema.ts';

export interface SocDashboardViewProps {
  onNavigate: (tab: 'overview' | 'alerts' | 'incidents' | 'events' | 'admin' | 'docs') => void;
  onInspectIncident?: (incidentId: number) => void;
  onInspectAlert?: (alertId: number) => void;
}

export const SocDashboardView: React.FC<SocDashboardViewProps> = ({
  onNavigate,
}) => {
  const { user, token } = useAuth();

  // Metrics
  const [incidentStats, setIncidentStats] = useState<any>(null);
  const [alertStats, setAlertStats] = useState<any>(null);
  const [eventStats, setEventStats] = useState<any>(null);

  // Recent feeds
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [urgentAlerts, setUrgentAlerts] = useState<any[]>([]);

  // State
  const [loading, setLoading] = useState(true);
  const [ingestingSample, setIngestingSample] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);

      const [incStatsRes, alertStatsRes, eventStatsRes, incListRes, alertListRes] = await Promise.all([
        fetch('/api/incidents/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/alerts/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/events/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/incidents?limit=5', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/alerts?limit=5&status=NEW', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (incStatsRes.ok) {
        const json = await incStatsRes.json();
        if (json.success) setIncidentStats(json.data);
      }

      if (alertStatsRes.ok) {
        const json = await alertStatsRes.json();
        if (json.success) setAlertStats(json.data);
      }

      if (eventStatsRes.ok) {
        const json = await eventStatsRes.json();
        if (json.success) setEventStats(json.data);
      }

      if (incListRes.ok) {
        const json = await incListRes.json();
        if (json.success) setActiveIncidents(json.data || []);
      }

      if (alertListRes.ok) {
        const json = await alertListRes.json();
        if (json.success) setUrgentAlerts(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load SOC dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Quick ingest sample Snort alert
  const handleIngestSample = async () => {
    if (!token || !canManage) return;
    setIngestingSample(true);
    setIngestSuccess(null);

    const samples = [
      {
        signatureId: 2100498,
        signatureMessage: 'GPL ATTACK_RESPONSE id check returned root',
        classification: 'Privilege Escalation Attempt',
        priority: 1,
        protocol: 'TCP',
        sourceIp: '198.51.100.77',
        destinationIp: '192.168.1.50',
        rawPayload: 'uid=0(root) gid=0(root) groups=0(root)',
      },
      {
        signatureId: 2014819,
        signatureMessage: 'ET WEB_SPECIFIC_APPS WordPress SQLi Union Select Attempt',
        classification: 'Web Application Attack',
        priority: 1,
        protocol: 'TCP',
        sourceIp: '203.0.113.45',
        destinationIp: '192.168.1.10',
        rawPayload: "GET /wp-admin/admin-ajax.php?id=1' UNION SELECT 1,user_pass FROM wp_users--",
      },
    ];

    const pick = samples[Math.floor(Math.random() * samples.length)];

    try {
      const res = await fetch('/api/events/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pick),
      });

      if (res.ok) {
        setIngestSuccess(`Snort alert ingested [SID:${pick.signatureId}] & auto-promoted to Alert.`);
        fetchDashboardData();
        setTimeout(() => setIngestSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Failed to ingest sample:', err);
    } finally {
      setIngestingSample(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV1':
      case 'CRITICAL':
        return <Badge variant="destructive">CRITICAL</Badge>;
      case 'SEV2':
      case 'HIGH':
        return <Badge variant="destructive">HIGH</Badge>;
      case 'SEV3':
      case 'MEDIUM':
        return <Badge variant="warning">MEDIUM</Badge>;
      case 'SEV4':
      case 'LOW':
      default:
        return <Badge variant="info">LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'NEW':
        return <Badge variant="destructive">{status}</Badge>;
      case 'INVESTIGATING':
      case 'IN_PROGRESS':
        return <Badge variant="warning">{status}</Badge>;
      case 'CONTAINED':
        return <Badge variant="info">CONTAINED</Badge>;
      case 'RESOLVED':
        return <Badge variant="success">RESOLVED</Badge>;
      case 'CLOSED':
      case 'DISMISSED':
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / System Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            Security Operations Command Center
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            NetGuard V1 &bull; Active Sensor Ingestion & Triage Matrix
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleIngestSample}
              disabled={ingestingSample}
              className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:text-zinc-100"
              title="Simulate incoming Snort IDS alert"
            >
              <Radio className={`h-3.5 w-3.5 text-red-400 ${ingestingSample ? 'animate-ping' : ''}`} />
              <span>Simulate Snort Alert</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            disabled={loading}
            className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {ingestSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-md text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{ingestSuccess}</span>
        </div>
      )}

      {/* 4 Primary SOC KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Incidents */}
        <Card className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span className="font-mono uppercase text-[10px] tracking-wider">Active Incidents</span>
              <Flame className="h-4 w-4 text-red-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {incidentStats ? incidentStats.active : 0}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('incidents')}
                className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Manage</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
              <span className="text-red-400 font-semibold">{incidentStats?.bySeverity?.sev1 || 0} SEV1</span>
              <span>&bull;</span>
              <span className="text-orange-400">{incidentStats?.bySeverity?.sev2 || 0} SEV2</span>
              <span>&bull;</span>
              <span className="text-zinc-400">{incidentStats?.total || 0} total cases</span>
            </div>
          </CardContent>
        </Card>

        {/* Unassigned Incident Queue */}
        <Card className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span className="font-mono uppercase text-[10px] tracking-wider">Unassigned Queue</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-amber-300">
                {incidentStats ? incidentStats.unassigned : 0}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('incidents')}
                className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Triage</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
              <span>Awaiting lead investigator assignment</span>
            </div>
          </CardContent>
        </Card>

        {/* Open Actionable Alerts */}
        <Card className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span className="font-mono uppercase text-[10px] tracking-wider">Open Alerts</span>
              <Bell className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {alertStats ? alertStats.byStatus?.new + alertStats.byStatus?.inProgress : 0}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('alerts')}
                className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Triage</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
              <span className="text-red-400">{alertStats?.bySeverity?.critical || 0} Critical</span>
              <span>&bull;</span>
              <span className="text-amber-400">{alertStats?.bySeverity?.high || 0} High</span>
              <span>&bull;</span>
              <span className="text-zinc-400">{alertStats?.total || 0} total</span>
            </div>
          </CardContent>
        </Card>

        {/* Raw Telemetry Ingested */}
        <Card className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span className="font-mono uppercase text-[10px] tracking-wider">Snort Telemetry</span>
              <ShieldAlert className="h-4 w-4 text-sky-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {eventStats ? eventStats.total : 0}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('events')}
                className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Inspect</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60 truncate">
              <span>{eventStats?.byPriority?.high || 0} High Priority &bull; {eventStats?.byPriority?.medium || 0} Medium</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dual Feed: Active Incidents & Urgent Alerts Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feed 1: Ongoing Security Incidents */}
        <Card className="bg-zinc-900/30">
          <CardHeader className="p-4 pb-3 border-b border-zinc-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Flame className="h-4 w-4 text-red-400" />
                Active Security Incidents
              </CardTitle>
              <CardDescription className="text-[11px]">
                Coordinated investigations currently underway
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('incidents')}
              className="h-7 text-xs border-zinc-700 bg-zinc-900"
            >
              View All ({incidentStats?.total || 0})
            </Button>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-800/80">
            {loading ? (
              <div className="py-8 text-center text-zinc-500 font-mono text-xs">
                Loading active incidents...
              </div>
            ) : activeIncidents.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 font-mono text-xs">
                No active incidents currently recorded.
              </div>
            ) : (
              activeIncidents.map((inc) => (
                <div key={inc.id} className="p-3.5 hover:bg-zinc-900/50 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-1 truncate">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(inc.severity)}
                      {getStatusBadge(inc.status)}
                      <span className="font-semibold text-zinc-200 truncate">{inc.title}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono truncate">
                      Assignee: {inc.assignee ? inc.assignee.email : <span className="text-amber-400">Unassigned</span>} &bull; {inc.alertCount} alerts linked
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('incidents')}
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    <span>Open</span>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Feed 2: Urgent Alerts Awaiting Triage */}
        <Card className="bg-zinc-900/30">
          <CardHeader className="p-4 pb-3 border-b border-zinc-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-400" />
                Urgent Alerts Triage Feed
              </CardTitle>
              <CardDescription className="text-[11px]">
                High-priority detections awaiting triage
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('alerts')}
              className="h-7 text-xs border-zinc-700 bg-zinc-900"
            >
              Alerts Table
            </Button>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-800/80">
            {loading ? (
              <div className="py-8 text-center text-zinc-500 font-mono text-xs">
                Loading urgent alerts...
              </div>
            ) : urgentAlerts.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 font-mono text-xs">
                Zero untriaged alerts. Clean operating queue.
              </div>
            ) : (
              urgentAlerts.map((al) => (
                <div key={al.id} className="p-3.5 hover:bg-zinc-900/50 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-1 truncate">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(al.severity)}
                      <span className="font-mono text-zinc-400 font-bold">#{al.id}</span>
                      <span className="font-semibold text-zinc-200 truncate">{al.title}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate">
                      {al.sourceIp} &rarr; {al.destinationIp} &bull; SID:{al.signatureId}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('alerts')}
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    <span>Triage</span>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cross Navigation Shortcuts */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-400">
        <span>Operational Quick Links:</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onNavigate('alerts')}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 cursor-pointer text-xs"
          >
            Alert Triage
          </button>
          <button
            onClick={() => onNavigate('incidents')}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 cursor-pointer text-xs"
          >
            Incidents
          </button>
          <button
            onClick={() => onNavigate('events')}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 cursor-pointer text-xs"
          >
            Telemetry Events
          </button>
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => onNavigate('admin')}
              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 cursor-pointer text-xs"
            >
              Operator Admin
            </button>
          )}
          <button
            onClick={() => onNavigate('docs')}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 cursor-pointer text-xs"
          >
            OpenAPI Specs
          </button>
        </div>
      </div>
    </div>
  );
};

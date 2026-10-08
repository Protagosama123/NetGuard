import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { ShieldAlert, ShieldCheck, Activity, Users, Radio, ArrowRight, PlusCircle, CheckCircle } from 'lucide-react';

export interface OverviewViewProps {
  onNavigate: (tab: 'overview' | 'events' | 'admin' | 'docs') => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<{
    total: number;
    byPriority: { high: number; medium: number; low: number; info: number };
    byProtocol: Record<string, number>;
    recentAlerts: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingestingSample, setIngestingSample] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/events/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStats(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [token]);

  // Ingest a simulated Snort alert for quick verification
  const handleIngestSample = async () => {
    if (!token) return;
    setIngestingSample(true);
    setIngestSuccess(null);

    const sampleSignatures = [
      {
        sid: 2001219,
        msg: 'ET SCAN Potential SSH Scan OUTBOUND',
        class: 'Attempted Information Leak',
        priority: 1,
        proto: 'TCP',
        src: '192.168.1.105',
        srcPort: 49152,
        dst: '10.0.0.1',
        dstPort: 22,
      },
      {
        sid: 2100498,
        msg: 'GPL ATTACK_RESPONSE id check returned root',
        class: 'Privilege Escalation Attempt',
        priority: 1,
        proto: 'TCP',
        src: '198.51.100.44',
        srcPort: 80,
        dst: '192.168.1.50',
        dstPort: 443,
      },
      {
        sid: 2002911,
        msg: 'ET SCAN Suspicious Inbound to MSSQL port 1433',
        class: 'Potentially Bad Traffic',
        priority: 2,
        proto: 'TCP',
        src: '203.0.113.12',
        srcPort: 51234,
        dst: '192.168.1.20',
        dstPort: 1433,
      },
      {
        sid: 2013028,
        msg: 'ET POLICY DNS Query to Suspicious Top Level Domain .top',
        class: 'Corporate Policy Violation',
        priority: 3,
        proto: 'UDP',
        src: '192.168.1.100',
        srcPort: 58212,
        dst: '1.1.1.1',
        dstPort: 53,
      },
    ];

    const pick = sampleSignatures[Math.floor(Math.random() * sampleSignatures.length)];

    try {
      const res = await fetch('/api/events/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signatureId: pick.sid,
          generatorId: 1,
          signatureRevision: 1,
          signatureMessage: pick.msg,
          classification: pick.class,
          priority: pick.priority,
          protocol: pick.proto,
          sourceIp: pick.src,
          sourcePort: pick.srcPort,
          destinationIp: pick.dst,
          destinationPort: pick.dstPort,
          timestamp: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setIngestSuccess(`Ingested SID ${pick.sid}: ${pick.msg}`);
        fetchStats();
      }
    } catch (err) {
      console.error('Ingestion failed:', err);
    } finally {
      setIngestingSample(false);
      setTimeout(() => setIngestSuccess(null), 4000);
    }
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 1:
        return <Badge variant="destructive">HIGH (1)</Badge>;
      case 2:
        return <Badge variant="warning">MEDIUM (2)</Badge>;
      case 3:
        return <Badge variant="info">LOW (3)</Badge>;
      default:
        return <Badge variant="secondary">INFO ({priority})</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
            Security Telemetry Console
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Boundary Contract: Snort detects. NetGuard manages.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {(user?.role === 'ADMIN' || user?.role === 'ANALYST') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleIngestSample}
              disabled={ingestingSample}
              className="text-xs flex items-center gap-1.5 border-zinc-700 bg-zinc-900/60"
            >
              <PlusCircle className="h-3.5 w-3.5 text-zinc-300" />
              {ingestingSample ? 'Ingesting...' : 'Ingest Sample Snort Alert'}
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onNavigate('events')}
            className="text-xs flex items-center gap-1.5"
          >
            <span>View All Telemetry</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {ingestSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-md text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{ingestSuccess}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs text-zinc-400 flex items-center justify-between">
              <span>Total Telemetry Events</span>
              <Activity className="h-4 w-4 text-zinc-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-zinc-100 pt-1">
              {loading ? '...' : stats?.total ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-zinc-500">
            Validated Snort alert records
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-red-950/50">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs text-zinc-400 flex items-center justify-between">
              <span>High Severity (Pri 1)</span>
              <ShieldAlert className="h-4 w-4 text-red-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-red-400 pt-1">
              {loading ? '...' : stats?.byPriority?.high ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-zinc-500">
            Intrusion & exploit attempts
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-amber-950/50">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs text-zinc-400 flex items-center justify-between">
              <span>Medium Severity (Pri 2)</span>
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-amber-400 pt-1">
              {loading ? '...' : stats?.byPriority?.medium ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-zinc-500">
            Suspicious scans & bad traffic
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs text-zinc-400 flex items-center justify-between">
              <span>Active Operator Role</span>
              <Users className="h-4 w-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-lg font-bold font-mono text-zinc-200 pt-1">
              {user?.role}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-zinc-500">
            {user?.email}
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts Feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Latest Ingested Snort Alerts
            </CardTitle>
            <CardDescription className="text-xs">
              Live normalized security telemetry feed.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStats}
            className="text-xs h-7 text-zinc-400 hover:text-zinc-200"
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-zinc-500 font-mono">Loading telemetry stream...</div>
          ) : !stats?.recentAlerts?.length ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs text-zinc-400">No telemetry events recorded yet.</p>
              {(user?.role === 'ADMIN' || user?.role === 'ANALYST') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleIngestSample}
                  className="text-xs"
                >
                  Ingest First Alert
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {stats.recentAlerts.map((alert: any) => (
                <div
                  key={alert.id}
                  className="p-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getPriorityBadge(alert.priority)}
                      <span className="text-xs font-mono font-medium text-zinc-200">
                        SID: {alert.signatureId}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {alert.protocol}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 font-medium">
                      {alert.signatureMessage}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {alert.sourceIp}{alert.sourcePort ? `:${alert.sourcePort}` : ''} &rarr; {alert.destinationIp}{alert.destinationPort ? `:${alert.destinationPort}` : ''}
                    </p>
                  </div>

                  <div className="text-right text-[11px] font-mono text-zinc-500 shrink-0">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

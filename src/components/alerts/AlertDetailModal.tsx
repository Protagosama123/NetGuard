import React from 'react';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { X, ShieldAlert, ArrowRight, Network, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import type { AlertSeverity, AlertStatus } from '../../db/schema.ts';

export interface AlertDetailModalProps {
  alert: any | null;
  onClose: () => void;
  onStatusChange?: (alertId: number, newStatus: AlertStatus) => void;
  canManage?: boolean;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  alert,
  onClose,
  onStatusChange,
  canManage = false,
}) => {
  if (!alert) return null;

  const getSeverityBadge = (severity: AlertSeverity) => {
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

  const getStatusBadge = (status: AlertStatus) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <span className="font-mono text-xs text-zinc-400">ALERT #{alert.id}</span>
              {getSeverityBadge(alert.severity)}
              {getStatusBadge(alert.status)}
            </div>
            <h2 className="text-base font-bold text-zinc-100 pt-1">
              {alert.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 -mr-2 -mt-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-4 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800 font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Signature ID (SID)</span>
              <span className="text-zinc-200 font-bold">{alert.signatureId}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Status</span>
              <span className="text-zinc-200">{alert.status}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Created</span>
              <span className="text-zinc-300">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Source Event</span>
              <span className="text-sky-400">{alert.securityEventId ? `#${alert.securityEventId}` : 'Manual'}</span>
            </div>
          </div>

          {/* Traffic Path */}
          <div className="space-y-1.5 bg-zinc-900/40 p-3.5 rounded-lg border border-zinc-800 font-mono">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] mb-1">
              <Network className="h-3.5 w-3.5 text-zinc-500" />
              <span>NETWORK TRAFFIC VECTOR</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">Source Host</span>
                <span className="text-zinc-100 font-medium">{alert.sourceIp}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 hidden sm:block shrink-0" />
              <div className="space-y-0.5 sm:text-right">
                <span className="text-[10px] text-zinc-500 uppercase block">Destination Host</span>
                <span className="text-zinc-100 font-medium">{alert.destinationIp}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {alert.description && (
            <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Context / Description</span>
              <p className="text-zinc-300 font-medium leading-relaxed">{alert.description}</p>
            </div>
          )}

          {/* Source Raw Event Snippet if linked */}
          {alert.sourceEvent && (
            <div className="space-y-2 p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-sky-400" />
                  ORIGINATING SNORT TELEMETRY EVENT #{alert.sourceEvent.id}
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  {alert.sourceEvent.protocol} {alert.sourceEvent.sourcePort ? `:${alert.sourceEvent.sourcePort}` : ''}
                </span>
              </div>
              {alert.sourceEvent.rawPayload && (
                <pre className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all max-h-28">
                  {alert.sourceEvent.rawPayload}
                </pre>
              )}
            </div>
          )}

          {/* Status Quick Action Controls for Analysts/Admins */}
          {canManage && onStatusChange && (
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Transition Status:</span>
              <div className="flex items-center gap-1.5">
                {alert.status === 'NEW' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(alert.id, 'IN_PROGRESS')}
                      className="text-xs text-amber-300 hover:text-amber-200"
                    >
                      Acknowledge (In Progress)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onStatusChange(alert.id, 'DISMISSED')}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {alert.status === 'IN_PROGRESS' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(alert.id, 'RESOLVED')}
                      className="text-xs text-emerald-300 hover:text-emerald-200"
                    >
                      Mark Resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onStatusChange(alert.id, 'DISMISSED')}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {(alert.status === 'RESOLVED' || alert.status === 'DISMISSED') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(alert.id, 'IN_PROGRESS')}
                    className="text-xs text-zinc-300 hover:text-zinc-100"
                  >
                    Reopen Alert
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-800 flex justify-end">
          <Button size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

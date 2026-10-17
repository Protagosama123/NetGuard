import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import {
  X,
  ShieldAlert,
  Link as LinkIcon,
  Unlink,
  FileCheck,
  MessageSquare,
  Terminal,
  ShieldCheck,
  Archive,
  Send,
  AlertCircle,
} from 'lucide-react';
import type { IncidentSeverity, IncidentStatus, InvestigationEntryType } from '../../db/schema.ts';

export interface IncidentDetailModalProps {
  incident: any | null;
  onClose: () => void;
  onStatusChange: (incidentId: number, newStatus: IncidentStatus, resolutionSummary?: string) => void;
  onAssign?: (incidentId: number, assigneeId: number | null) => void;
  onUnlinkAlert: (incidentId: number, alertId: number) => void;
  onLinkAlerts: (incidentId: number, alertIds: number[]) => void;
  canManage?: boolean;
}

export const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  incident,
  onClose,
  onStatusChange,
  onAssign,
  onUnlinkAlert,
  canManage = false,
}) => {
  const { token } = useAuth();

  // Resolution state
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Assignment editing state
  const [isChangingAssignee, setIsChangingAssignee] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<any[]>([]);

  // Investigation timeline state
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [newEntryContent, setNewEntryContent] = useState('');
  const [newEntryType, setNewEntryType] = useState<InvestigationEntryType>('NOTE');
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Fetch operators eligible for assignment (ADMIN and ANALYST)
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          const eligible = json.data.filter((u: any) => u.isActive && (u.role === 'ADMIN' || u.role === 'ANALYST'));
          setEligibleUsers(eligible);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!incident?.id || !token) return;
    setLoadingInv(true);
    fetch(`/api/incidents/${incident.id}/investigations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setInvestigations(json.data || []);
        }
      })
      .catch((err) => console.error('Failed to load investigation entries:', err))
      .finally(() => setLoadingInv(false));
  }, [incident?.id, token]);

  if (!incident) return null;

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntryContent.trim() || !token) return;

    setSubmittingEntry(true);
    setEntryError(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/investigations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryType: newEntryType,
          content: newEntryContent.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add investigation entry');
      }

      setInvestigations((prev) => [...prev, json.data]);
      setNewEntryContent('');
    } catch (err: any) {
      setEntryError(err.message || 'Error recording entry');
    } finally {
      setSubmittingEntry(false);
    }
  };

  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case 'SEV1':
        return <Badge variant="destructive">SEV1 - CRITICAL</Badge>;
      case 'SEV2':
        return <Badge variant="destructive">SEV2 - HIGH</Badge>;
      case 'SEV3':
        return <Badge variant="warning">SEV3 - MEDIUM</Badge>;
      case 'SEV4':
      default:
        return <Badge variant="info">SEV4 - LOW</Badge>;
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
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

  const getEntryBadge = (type: InvestigationEntryType) => {
    switch (type) {
      case 'ACTION_TAKEN':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-800/60 text-sky-400 text-[10px] font-mono">
            <Terminal className="h-3 w-3" /> ACTION
          </span>
        );
      case 'CONTAINMENT':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-400 text-[10px] font-mono">
            <ShieldCheck className="h-3 w-3" /> CONTAINMENT
          </span>
        );
      case 'EVIDENCE':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-purple-400 text-[10px] font-mono">
            <Archive className="h-3 w-3" /> EVIDENCE
          </span>
        );
      case 'NOTE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono">
            <MessageSquare className="h-3 w-3" /> NOTE
          </span>
        );
    }
  };

  const handleConfirmResolve = (targetStatus: IncidentStatus) => {
    if (!resolutionSummary.trim()) {
      setResolutionError('A resolution summary is required to resolve or close an incident.');
      return;
    }
    onStatusChange(incident.id, targetStatus, resolutionSummary.trim());
    setIsResolving(false);
    setResolutionSummary('');
    setResolutionError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              <span className="font-mono text-xs text-zinc-400">INCIDENT #{incident.id}</span>
              {getSeverityBadge(incident.severity)}
              {getStatusBadge(incident.status)}
            </div>
            <h2 className="text-base font-bold text-zinc-100 pt-1">
              {incident.title}
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
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800 font-mono">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase block">Assignee</span>
                {canManage && onAssign && !isChangingAssignee && (
                  <button
                    type="button"
                    onClick={() => setIsChangingAssignee(true)}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                  >
                    Change
                  </button>
                )}
              </div>
              {isChangingAssignee ? (
                <div className="mt-1 flex items-center gap-1">
                  <select
                    defaultValue={incident.assignedTo || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      onAssign && onAssign(incident.id, val);
                      setIsChangingAssignee(false);
                    }}
                    className="h-6 text-[10px] bg-zinc-950 border border-zinc-700 rounded px-1 text-zinc-200 font-mono w-full"
                  >
                    <option value="">Unassigned</option>
                    {eligibleUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsChangingAssignee(false)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="text-zinc-200 font-medium truncate block">
                  {incident.assignee ? incident.assignee.email : 'Unassigned'}
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Created By</span>
              <span className="text-zinc-300">
                {incident.creator ? incident.creator.email : 'System/Bootstrap'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Declared Time</span>
              <span className="text-zinc-300 font-mono">
                {new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                <span className="text-zinc-500">{new Date(incident.createdAt).toISOString().split('T')[0]}</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Resolved At</span>
              <span className="text-emerald-400 font-mono">
                {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="p-3.5 bg-zinc-900/40 rounded-lg border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Scope & Initial Assessment</span>
            <p className="text-zinc-300 font-medium leading-relaxed">{incident.description}</p>
          </div>

          {/* Resolution Summary if present */}
          {incident.resolutionSummary && (
            <div className="p-3.5 bg-emerald-950/20 rounded-lg border border-emerald-900/40 space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-mono flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5" /> Resolution Summary
              </span>
              <p className="text-emerald-200 font-medium leading-relaxed">{incident.resolutionSummary}</p>
            </div>
          )}

          {/* Linked Alerts Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-zinc-500" />
                ASSOCIATED CORRELATED ALERTS ({incident.alerts?.length || 0})
              </span>
            </div>

            {(!incident.alerts || incident.alerts.length === 0) ? (
              <div className="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/80 text-center text-zinc-500 font-mono text-[11px]">
                No alerts currently linked to this incident.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                {incident.alerts.map((al: any) => (
                  <div key={al.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-400 font-bold">#{al.id}</span>
                        <span className="font-mono text-[11px] text-zinc-500">[SID:{al.signatureId}]</span>
                        <span className="font-medium text-zinc-200 truncate">{al.title}</span>
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500">
                        {al.sourceIp} &rarr; {al.destinationIp}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] text-zinc-400 uppercase">{al.severity}</span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onUnlinkAlert(incident.id, al.id)}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                          title="Unlink alert from this incident"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Investigation Findings Timeline */}
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
                INVESTIGATION TIMELINE & FORENSIC FINDINGS ({investigations.length})
              </span>
            </div>

            {loadingInv ? (
              <div className="p-4 text-center text-zinc-500 font-mono text-[11px]">
                Loading investigation timeline...
              </div>
            ) : investigations.length === 0 ? (
              <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800/80 text-center text-zinc-500 font-mono text-[11px]">
                No investigation findings recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {investigations.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getEntryBadge(entry.entryType)}
                        <span className="font-mono text-[11px] text-zinc-300">
                          {entry.author ? entry.author.email : 'System/Bootstrap'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        {new Date(entry.createdAt).toISOString().split('T')[0]}
                      </span>
                    </div>
                    <p className="text-zinc-200 text-xs pl-0.5 leading-relaxed font-sans whitespace-pre-wrap">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Append Investigation Finding Form */}
            {canManage && (
              <form onSubmit={handleAddEntry} className="pt-2 space-y-2">
                {entryError && (
                  <p className="text-red-400 text-[11px] font-mono">{entryError}</p>
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={newEntryType}
                    onChange={(e) => setNewEntryType(e.target.value as InvestigationEntryType)}
                    className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs font-mono text-zinc-200 focus:outline-none"
                  >
                    <option value="NOTE">NOTE (General Finding)</option>
                    <option value="ACTION_TAKEN">ACTION (Remediation Step)</option>
                    <option value="CONTAINMENT">CONTAINMENT (Host/Net Isolation)</option>
                    <option value="EVIDENCE">EVIDENCE (Packet/Log Artifact)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={newEntryContent}
                    onChange={(e) => setNewEntryContent(e.target.value)}
                    placeholder="Record analytical observation, remediation action, or forensic note..."
                    rows={2}
                    required
                    className="flex-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submittingEntry || !newEntryContent.trim()}
                    className="self-end text-xs flex items-center gap-1.5 h-9"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Post</span>
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Resolution Prompt Form */}
          {isResolving && (
            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-700 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Incident Resolution Notes</span>
                <button
                  type="button"
                  onClick={() => setIsResolving(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  Cancel
                </button>
              </div>
              {resolutionError && (
                <p className="text-red-400 text-[11px]">{resolutionError}</p>
              )}
              <textarea
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Detail containment actions taken, root cause findings, and perimeter adjustments..."
                rows={2}
                className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-100 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => handleConfirmResolve('RESOLVED')}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Mark as Resolved
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleConfirmResolve('CLOSED')}
                  className="text-xs"
                >
                  Close Incident
                </Button>
              </div>
            </div>
          )}

          {/* Incident Lifecycle Action Buttons */}
          {canManage && !isResolving && (
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-mono text-zinc-400">Lifecycle State Actions:</span>
              <div className="flex items-center gap-1.5">
                {incident.status === 'OPEN' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(incident.id, 'INVESTIGATING')}
                    className="text-xs text-amber-300 hover:text-amber-200"
                  >
                    Start Investigation
                  </Button>
                )}

                {incident.status === 'INVESTIGATING' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(incident.id, 'CONTAINED')}
                      className="text-xs text-sky-300 hover:text-sky-200"
                    >
                      Mark Contained
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsResolving(true)}
                      className="text-xs text-emerald-300 hover:text-emerald-200"
                    >
                      Resolve Incident
                    </Button>
                  </>
                )}

                {incident.status === 'CONTAINED' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(incident.id, 'INVESTIGATING')}
                      className="text-xs text-zinc-300 hover:text-zinc-100"
                    >
                      Resume Investigation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsResolving(true)}
                      className="text-xs text-emerald-300 hover:text-emerald-200"
                    >
                      Resolve Incident
                    </Button>
                  </>
                )}

                {incident.status === 'RESOLVED' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(incident.id, 'CLOSED')}
                      className="text-xs text-zinc-300 hover:text-zinc-100"
                    >
                      Close Incident
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onStatusChange(incident.id, 'INVESTIGATING')}
                      className="text-xs text-amber-400 hover:text-amber-300"
                    >
                      Reopen Incident
                    </Button>
                  </>
                )}

                {incident.status === 'CLOSED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(incident.id, 'INVESTIGATING')}
                    className="text-xs text-amber-400 hover:text-amber-300"
                  >
                    Reopen Incident
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

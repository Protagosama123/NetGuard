import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Alert } from '../ui/alert.tsx';
import { X, Plus, AlertCircle, ShieldAlert } from 'lucide-react';
import type { IncidentSeverity } from '../../db/schema.ts';

export interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateIncidentModal: React.FC<CreateIncidentModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('SEV2');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [selectedAlertIds, setSelectedAlertIds] = useState<number[]>([]);

  // Available options
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);
  const [availableAlerts, setAvailableAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !token) return;

    // Fetch operators eligible for assignment (ADMIN and ANALYST)
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          const eligible = json.data.filter((u: any) => u.isActive && (u.role === 'ADMIN' || u.role === 'ANALYST'));
          setAssignableUsers(eligible);
        }
      })
      .catch(() => {});

    // Fetch open alerts to attach
    fetch('/api/alerts?limit=50', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          setAvailableAlerts(json.data);
        }
      })
      .catch(() => {});
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleToggleAlert = (alertId: number) => {
    setSelectedAlertIds((prev) =>
      prev.includes(alertId) ? prev.filter((id) => id !== alertId) : [...prev, alertId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Description must be at least 5 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
          assignedTo: assignedTo ? Number(assignedTo) : null,
          alertIds: selectedAlertIds.length > 0 ? selectedAlertIds : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create incident');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error communicating with Incidents API');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Declare New Security Incident
            </h2>
            <p className="text-xs text-zinc-400">
              Establish a coordinated operational incident case for investigation & containment.
            </p>
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

        <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs">
          {error && (
            <Alert variant="destructive" className="py-2.5 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </Alert>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-zinc-300">Incident Title*</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. INC-204: Multiple SQL Injection Attempts on Production DB"
              required
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-300">Severity Level*</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="SEV1">SEV1 - Critical (Immediate Threat/Exploit)</option>
                <option value="SEV2">SEV2 - High (Active Probe/Unauthorized Action)</option>
                <option value="SEV3">SEV3 - Medium (Suspicious Pattern)</option>
                <option value="SEV4">SEV4 - Low (Policy Violation/Triage)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-300">Assign Lead Investigator</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">Unassigned (Awaiting Triage)</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-zinc-300">Scope & Initial Assessment*</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detail the observed attack surface, affected hosts, and immediate risk..."
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 p-2.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          {/* Alert Association Picker */}
          {availableAlerts.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-zinc-800">
              <label className="text-[11px] font-mono text-zinc-400 block">
                Attach Correlated Alerts ({selectedAlertIds.length} selected)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded border border-zinc-800 bg-zinc-900/30 p-2">
                {availableAlerts.map((al) => {
                  const isChecked = selectedAlertIds.includes(al.id);
                  return (
                    <div
                      key={al.id}
                      onClick={() => handleToggleAlert(al.id)}
                      className={`p-2 rounded flex items-center justify-between text-[11px] font-mono cursor-pointer transition-colors ${
                        isChecked ? 'bg-zinc-800/90 text-zinc-100 border border-zinc-700' : 'hover:bg-zinc-900/60 text-zinc-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div
                          className="rounded border-zinc-700 text-zinc-200"
                        />
                        <span className="font-semibold text-zinc-300">#{al.id}</span>
                        <span className="truncate">{al.title}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                        {al.severity} &bull; {al.sourceIp}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="text-xs">
              {submitting ? 'Creating Incident...' : 'Declare Incident'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Alert } from '../ui/alert.tsx';
import { X, Send, AlertCircle, Wand2 } from 'lucide-react';

export interface IngestAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const IngestAlertModal: React.FC<IngestAlertModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [signatureId, setSignatureId] = useState('2001219');
  const [signatureMessage, setSignatureMessage] = useState('ET SCAN Potential SSH Scan OUTBOUND');
  const [priority, setPriority] = useState('1');
  const [protocol, setProtocol] = useState('TCP');
  const [classification, setClassification] = useState('Attempted Information Leak');
  const [sourceIp, setSourceIp] = useState('192.168.1.105');
  const [sourcePort, setSourcePort] = useState('49152');
  const [destinationIp, setDestinationIp] = useState('10.0.0.1');
  const [destinationPort, setDestinationPort] = useState('22');
  const [rawPayload, setRawPayload] = useState('SSH-2.0-OpenSSH_8.2p1');

  if (!isOpen) return null;

  const handleApplyPreset = (type: 'ssh' | 'sqli' | 'dns' | 'priv') => {
    if (type === 'ssh') {
      setSignatureId('2001219');
      setSignatureMessage('ET SCAN Potential SSH Scan OUTBOUND');
      setPriority('1');
      setProtocol('TCP');
      setClassification('Attempted Information Leak');
      setSourceIp('192.168.1.105');
      setSourcePort('49152');
      setDestinationIp('10.0.0.1');
      setDestinationPort('22');
      setRawPayload('SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5');
    } else if (type === 'sqli') {
      setSignatureId('2014819');
      setSignatureMessage('ET WEB_SPECIFIC_APPS WordPress SQL Injection Union Select Attempt');
      setPriority('1');
      setProtocol('TCP');
      setClassification('Web Application Attack');
      setSourceIp('203.0.113.88');
      setSourcePort('53412');
      setDestinationIp('192.168.1.10');
      setDestinationPort('80');
      setRawPayload("GET /wp-admin/admin-ajax.php?action=query&id=1' UNION SELECT 1,user_login,user_pass FROM wp_users-- HTTP/1.1");
    } else if (type === 'dns') {
      setSignatureId('2013028');
      setSignatureMessage('ET POLICY DNS Query to Suspicious Top Level Domain .top');
      setPriority('3');
      setProtocol('UDP');
      setClassification('Corporate Policy Violation');
      setSourceIp('192.168.1.140');
      setSourcePort('57891');
      setDestinationIp('1.1.1.1');
      setDestinationPort('53');
      setRawPayload('Standard query 0x1a2b A malware-c2-beacon.top');
    } else if (type === 'priv') {
      setSignatureId('2100498');
      setSignatureMessage('GPL ATTACK_RESPONSE id check returned root');
      setPriority('1');
      setProtocol('TCP');
      setClassification('Privilege Escalation Attempt');
      setSourceIp('198.51.100.44');
      setSourcePort('80');
      setDestinationIp('192.168.1.50');
      setDestinationPort('443');
      setRawPayload('uid=0(root) gid=0(root) groups=0(root)');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/events/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signatureId: Number(signatureId),
          generatorId: 1,
          signatureRevision: 1,
          signatureMessage: signatureMessage.trim(),
          classification: classification.trim(),
          priority: Number(priority),
          protocol: protocol.trim().toUpperCase(),
          sourceIp: sourceIp.trim(),
          sourcePort: sourcePort ? Number(sourcePort) : null,
          destinationIp: destinationIp.trim(),
          destinationPort: destinationPort ? Number(destinationPort) : null,
          rawPayload: rawPayload.trim() || null,
          timestamp: new Date().toISOString(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Ingestion request failed');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error communicating with NetGuard ingestion API');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-400" />
              Ingest Snort Alert Telemetry
            </h2>
            <p className="text-xs text-zinc-400">
              Inject validated Snort alert data into NetGuard's telemetry management stream.
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

        {/* Presets Toolbar */}
        <div className="py-3 border-b border-zinc-800/80 flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
            <Wand2 className="h-3 w-3 text-zinc-400" /> Presets:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset('ssh')}
            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] hover:bg-zinc-800 font-mono"
          >
            SSH Scan
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('sqli')}
            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] hover:bg-zinc-800 font-mono text-red-300"
          >
            SQLi Probe
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('priv')}
            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] hover:bg-zinc-800 font-mono text-amber-300"
          >
            Root Privilege
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('dns')}
            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] hover:bg-zinc-800 font-mono text-sky-300"
          >
            DNS C2
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {error && (
            <Alert variant="destructive" className="py-2.5 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Signature ID (SID)*</label>
              <Input
                type="number"
                value={signatureId}
                onChange={(e) => setSignatureId(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Severity Priority*</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="1">1 - High Severity</option>
                <option value="2">2 - Medium Severity</option>
                <option value="3">3 - Low Severity</option>
                <option value="4">4 - Informational</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-zinc-400">Signature Message*</label>
            <Input
              value={signatureMessage}
              onChange={(e) => setSignatureMessage(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Classification</label>
              <Input
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Protocol*</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP</option>
                <option value="IP">IP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Source IP* & Port</label>
              <div className="flex gap-2">
                <Input
                  value={sourceIp}
                  onChange={(e) => setSourceIp(e.target.value)}
                  placeholder="192.168.1.100"
                  required
                  className="font-mono text-xs flex-1"
                />
                <Input
                  value={sourcePort}
                  onChange={(e) => setSourcePort(e.target.value)}
                  placeholder="Port"
                  type="number"
                  className="font-mono text-xs w-20"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400">Destination IP* & Port</label>
              <div className="flex gap-2">
                <Input
                  value={destinationIp}
                  onChange={(e) => setDestinationIp(e.target.value)}
                  placeholder="10.0.0.1"
                  required
                  className="font-mono text-xs flex-1"
                />
                <Input
                  value={destinationPort}
                  onChange={(e) => setDestinationPort(e.target.value)}
                  placeholder="Port"
                  type="number"
                  className="font-mono text-xs w-20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-zinc-400">Raw Packet Payload Snippet</label>
            <textarea
              value={rawPayload}
              onChange={(e) => setRawPayload(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 p-2 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
              placeholder="Packet data or header text..."
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="text-xs">
              {submitting ? 'Ingesting...' : 'Ingest Alert'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

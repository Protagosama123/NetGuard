import React from 'react';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { X, Copy, Check, ShieldAlert, ArrowRight, Network, FileText, Hash } from 'lucide-react';

export interface EventDetailModalProps {
  event: any | null;
  onClose: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!event) return null;

  const handleCopyPayload = () => {
    if (event.rawPayload) {
      navigator.clipboard.writeText(event.rawPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 1:
        return <Badge variant="destructive">HIGH SEVERITY (Priority 1)</Badge>;
      case 2:
        return <Badge variant="warning">MEDIUM SEVERITY (Priority 2)</Badge>;
      case 3:
        return <Badge variant="info">LOW SEVERITY (Priority 3)</Badge>;
      default:
        return <Badge variant="secondary">INFO (Priority {priority})</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <span className="font-mono text-xs text-zinc-400">TELEMETRY RECORD #{event.id}</span>
              {getPriorityBadge(event.priority)}
            </div>
            <h2 className="text-base font-bold text-zinc-100 pt-1">
              {event.signatureMessage}
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
        <div className="py-4 space-y-5 text-xs">
          {/* Snort Signature Identifiers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80 font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Signature ID (SID)</span>
              <span className="text-zinc-200 font-bold">{event.signatureId}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Generator ID (GID)</span>
              <span className="text-zinc-200">{event.generatorId}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Revision</span>
              <span className="text-zinc-200">{event.signatureRevision}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Protocol</span>
              <span className="text-zinc-200 font-semibold text-sky-400">{event.protocol}</span>
            </div>
          </div>

          {/* Network Path */}
          <div className="space-y-1.5 bg-zinc-900/40 p-3.5 rounded-lg border border-zinc-800/80">
            <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px] mb-2">
              <Network className="h-3.5 w-3.5 text-zinc-500" />
              <span>NETWORK TRAFFIC VECTOR</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">SOURCE IP & PORT</span>
                <span className="text-zinc-100 font-medium">
                  {event.sourceIp}
                  {event.sourcePort !== null && (
                    <span className="text-zinc-400">:{event.sourcePort}</span>
                  )}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 hidden sm:block shrink-0" />
              <div className="space-y-0.5 sm:text-right">
                <span className="text-[10px] text-zinc-500 uppercase block">DESTINATION IP & PORT</span>
                <span className="text-zinc-100 font-medium">
                  {event.destinationIp}
                  {event.destinationPort !== null && (
                    <span className="text-zinc-400">:{event.destinationPort}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Classification & Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Classification</span>
              <span className="text-zinc-300 font-medium">{event.classification || 'None specified'}</span>
            </div>
            <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Detected Timestamp</span>
              <span className="text-zinc-300 font-mono">{new Date(event.timestamp).toUTCString()}</span>
            </div>
          </div>

          {/* Raw Payload Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
                RAW PACKET TELEMETRY PAYLOAD
              </span>
              {event.rawPayload && (
                <button
                  onClick={handleCopyPayload}
                  className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Payload</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all max-h-36">
              {event.rawPayload || '// No raw packet payload attached to this alert'}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-800 flex justify-end">
          <Button size="sm" onClick={onClose} className="text-xs">
            Close Inspector
          </Button>
        </div>
      </div>
    </div>
  );
};

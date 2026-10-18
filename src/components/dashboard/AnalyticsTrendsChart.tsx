import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card.tsx';
import type { TrendBucket } from '../../server/analytics/analytics.service.ts';

export interface AnalyticsTrendsChartProps {
  title: string;
  description: string;
  timeRange: '24h' | '7d' | '30d';
  bucketInterval: '1h' | '1d';
  buckets: TrendBucket[];
  type: 'alerts' | 'incidents';
}

export const AnalyticsTrendsChart: React.FC<AnalyticsTrendsChartProps> = ({
  title,
  description,
  timeRange,
  bucketInterval,
  buckets,
  type,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!buckets || buckets.length === 0) {
    return (
      <Card className="bg-zinc-900/30 border-zinc-800">
        <CardHeader className="p-4 pb-2 border-b border-zinc-800">
          <CardTitle className="text-sm font-semibold text-zinc-100">{title}</CardTitle>
          <CardDescription className="text-[11px] text-zinc-400">{description}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 text-center text-xs text-zinc-500 font-mono">
          No trend data recorded for this window.
        </CardContent>
      </Card>
    );
  }

  // Calculate maximum value for Y-axis scale
  let maxValue = 1;
  for (const b of buckets) {
    const val = type === 'alerts' ? b.alertsTotal : Math.max(b.incidentsDeclared, b.incidentsResolved);
    if (val > maxValue) maxValue = val;
  }
  // Round up to nice number
  const yMax = Math.max(4, Math.ceil(maxValue * 1.2));

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    if (bucketInterval === '1h') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const chartHeight = 140;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const totalWidth = 600;
  const innerWidth = totalWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const barWidth = Math.max(4, (innerWidth / buckets.length) * 0.7);

  const hoveredBucket = hoveredIndex !== null ? buckets[hoveredIndex] : null;

  return (
    <Card className="bg-zinc-900/30 border-zinc-800 relative">
      <CardHeader className="p-4 pb-2 border-b border-zinc-800 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-zinc-100">{title}</CardTitle>
          <CardDescription className="text-[11px] text-zinc-400">{description}</CardDescription>
        </div>
        {type === 'alerts' ? (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Critical
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> High
            </span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Med/Low
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Declared
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Resolved
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-3 pt-4">
        {/* SVG Histogram */}
        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${totalWidth} ${chartHeight}`}
            className="w-full h-36 overflow-visible select-none"
          >
            {/* Horizontal Grid lines */}
            {[0, 0.5, 1].map((ratio) => {
              const y = paddingTop + innerHeight * (1 - ratio);
              const labelVal = Math.round(yMax * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={totalWidth - paddingRight}
                    y2={y}
                    stroke="#27272a"
                    strokeDasharray={ratio > 0 ? '3 3' : 'none'}
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#71717a"
                    className="text-[9px] font-mono"
                  >
                    {labelVal}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {buckets.map((b, i) => {
              const xCenter = paddingLeft + (i + 0.5) * (innerWidth / buckets.length);
              const xBar = xCenter - barWidth / 2;

              if (type === 'alerts') {
                const totalH = (b.alertsTotal / yMax) * innerHeight;
                const critH = (b.alertsCritical / yMax) * innerHeight;
                const highH = (b.alertsHigh / yMax) * innerHeight;
                const otherH = Math.max(0, totalH - critH - highH);

                const yBase = paddingTop + innerHeight;
                const yCrit = yBase - critH;
                const yHigh = yCrit - highH;
                const yOther = yHigh - otherH;

                const isHovered = hoveredIndex === i;

                return (
                  <g
                    key={b.timestamp}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="cursor-pointer transition-opacity"
                    opacity={hoveredIndex === null || isHovered ? 1 : 0.4}
                  >
                    {/* Hit target area */}
                    <rect
                      x={xCenter - innerWidth / buckets.length / 2}
                      y={paddingTop}
                      width={innerWidth / buckets.length}
                      height={innerHeight}
                      fill="transparent"
                    />

                    {b.alertsTotal === 0 ? (
                      <circle cx={xCenter} cy={yBase - 1} r="1" fill="#3f3f46" />
                    ) : (
                      <>
                        {critH > 0 && (
                          <rect
                            x={xBar}
                            y={yCrit}
                            width={barWidth}
                            height={critH}
                            fill="#ef4444"
                            rx="1"
                          />
                        )}
                        {highH > 0 && (
                          <rect
                            x={xBar}
                            y={yHigh}
                            width={barWidth}
                            height={highH}
                            fill="#f59e0b"
                            rx="1"
                          />
                        )}
                        {otherH > 0 && (
                          <rect
                            x={xBar}
                            y={yOther}
                            width={barWidth}
                            height={otherH}
                            fill="#38bdf8"
                            rx="1"
                          />
                        )}
                      </>
                    )}

                    {/* X axis labels (sparse) */}
                    {(i % Math.ceil(buckets.length / 6) === 0 || i === buckets.length - 1) && (
                      <text
                        x={xCenter}
                        y={chartHeight - 6}
                        textAnchor="middle"
                        fill="#71717a"
                        className="text-[9px] font-mono"
                      >
                        {formatTimestamp(b.timestamp)}
                      </text>
                    )}
                  </g>
                );
              } else {
                // Incidents Declared vs Resolved dual bar
                const halfW = Math.max(2, (barWidth - 1) / 2);
                const decH = (b.incidentsDeclared / yMax) * innerHeight;
                const resH = (b.incidentsResolved / yMax) * innerHeight;
                const yBase = paddingTop + innerHeight;

                const isHovered = hoveredIndex === i;

                return (
                  <g
                    key={b.timestamp}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="cursor-pointer transition-opacity"
                    opacity={hoveredIndex === null || isHovered ? 1 : 0.4}
                  >
                    <rect
                      x={xCenter - innerWidth / buckets.length / 2}
                      y={paddingTop}
                      width={innerWidth / buckets.length}
                      height={innerHeight}
                      fill="transparent"
                    />

                    {/* Declared Bar */}
                    {decH > 0 ? (
                      <rect
                        x={xCenter - halfW - 0.5}
                        y={yBase - decH}
                        width={halfW}
                        height={decH}
                        fill="#ef4444"
                        rx="1"
                      />
                    ) : (
                      <circle cx={xCenter - halfW / 2} cy={yBase - 1} r="1" fill="#3f3f46" />
                    )}

                    {/* Resolved Bar */}
                    {resH > 0 ? (
                      <rect
                        x={xCenter + 0.5}
                        y={yBase - resH}
                        width={halfW}
                        height={resH}
                        fill="#10b981"
                        rx="1"
                      />
                    ) : (
                      <circle cx={xCenter + halfW / 2} cy={yBase - 1} r="1" fill="#3f3f46" />
                    )}

                    {/* X axis labels */}
                    {(i % Math.ceil(buckets.length / 6) === 0 || i === buckets.length - 1) && (
                      <text
                        x={xCenter}
                        y={chartHeight - 6}
                        textAnchor="middle"
                        fill="#71717a"
                        className="text-[9px] font-mono"
                      >
                        {formatTimestamp(b.timestamp)}
                      </text>
                    )}
                  </g>
                );
              }
            })}
          </svg>
        </div>

        {/* Dynamic Hover Tooltip summary */}
        <div className="h-6 flex items-center justify-between text-[11px] font-mono text-zinc-400 px-2 pt-1 border-t border-zinc-800/60">
          {hoveredBucket ? (
            <>
              <span className="text-zinc-300">
                {new Date(hoveredBucket.timestamp).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {type === 'alerts' ? (
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100">{hoveredBucket.alertsTotal} alerts</span>
                  <span className="text-red-400">{hoveredBucket.alertsCritical} crit</span>
                  <span className="text-amber-400">{hoveredBucket.alertsHigh} high</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-red-400">{hoveredBucket.incidentsDeclared} declared</span>
                  <span className="text-emerald-400">{hoveredBucket.incidentsResolved} resolved</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-zinc-500">Hover over bars to inspect discrete time intervals</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

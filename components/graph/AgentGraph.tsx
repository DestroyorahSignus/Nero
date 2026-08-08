"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { AgentStepData, ToolCallData, StepStatus } from "@/ai/types";

/* ── Custom node ─────────────────────────────────────────────────── */

type AgentNodeData = {
  title: string;
  subtitle: string;
  status: StepStatus;
  accent: string; // tailwind text color class
  idle?: boolean; // pre-deploy: breathe faintly so the console feels alive
  role?: string;
};
type AgentFlowNode = Node<AgentNodeData, "agent">;

const ACCENT_HEX: Record<string, string> = {
  "text-ember": "#f2b94b",
  "text-spectral": "#5ee1ff",
  "text-crimson": "#e1364c",
  "text-arcane": "#9d7bff",
  "text-bone": "#edf1f7",
};

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const stateClass =
    data.status === "running"
      ? "node-running"
      : data.status === "failed"
        ? "node-failed"
        : data.status === "done"
          ? "node-done"
          : data.idle
            ? "node-idle"
            : "";
  const dot =
    data.status === "running"
      ? "bg-spectral animate-pulse"
      : data.status === "done"
        ? "bg-spectral"
        : data.status === "failed"
          ? "bg-crimson"
          : "bg-edge";
  return (
    <div
      className={`node-hover cut-sm min-w-36 cursor-pointer border border-edge bg-panel px-4 py-3 ${stateClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-edge" />
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 ${dot}`} aria-hidden />
        <p className={`font-display text-sm font-bold italic ${data.accent}`}>
          {data.title}
        </p>
      </div>
      <p className="font-mono mt-0.5 max-w-44 truncate text-[9px] tracking-wider text-mist">
        {data.subtitle}
      </p>
      <Handle type="source" position={Position.Right} className="!bg-edge" />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

/* ── Options toolbar ─────────────────────────────────────────────── */

function GraphToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`press font-mono cut-sm border px-2 py-1 text-[9px] tracking-widest transition ${
        on
          ? "border-spectral bg-spectral/15 text-spectral"
          : "border-edge bg-panel/80 text-mist hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Graph ───────────────────────────────────────────────────────── */

export function AgentGraph({
  agentSteps,
  toolCalls,
}: {
  agentSteps: AgentStepData[];
  toolCalls: ToolCallData[];
}) {
  const [draggable, setDraggable] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [scrollZoom, setScrollZoom] = useState(false);
  const [selected, setSelected] = useState<AgentNodeData | null>(null);
  const [inst, setInst] = useState<ReactFlowInstance<AgentFlowNode, Edge> | null>(null);

  const computed = useMemo(() => {
    const latest = (agent: string): AgentStepData | undefined =>
      [...agentSteps].reverse().find((s) => s.agent === agent);

    const vergil = latest("VERGIL");
    const nero = latest("NERO");
    const lady = latest("LADY");
    const anyFail = lady?.status === "failed";
    const status = (s?: AgentStepData): StepStatus => s?.status ?? "pending";
    const idle = agentSteps.length === 0;

    const nodes: AgentFlowNode[] = [
      {
        id: "vergil",
        type: "agent",
        position: { x: 0, y: 90 },
        data: {
          title: "VERGIL",
          subtitle: vergil?.detail ?? (idle ? "awaiting orders" : "planner"),
          status: status(vergil),
          accent: "text-ember",
          idle,
          role: "Planner",
        },
      },
      {
        id: "nero",
        type: "agent",
        position: { x: 230, y: 90 },
        data: {
          title: "NERO",
          subtitle: nero?.detail ?? (idle ? "standing by" : "executor"),
          status: status(nero),
          accent: "text-spectral",
          idle,
          role: "Executor",
        },
      },
      {
        id: "lady",
        type: "agent",
        position: { x: 460, y: 90 },
        data: {
          title: "LADY",
          subtitle: lady?.detail ?? (idle ? "ready to judge" : "critic"),
          status: status(lady),
          accent: "text-crimson",
          idle,
          role: "Critic",
        },
      },
      {
        id: "trish",
        type: "agent",
        position: { x: 230, y: 210 },
        data: {
          title: "TRISH",
          subtitle: anyFail ? "reflection stored" : "memory",
          status: anyFail ? "done" : "pending",
          accent: "text-arcane",
          idle,
          role: "Memory",
        },
      },
    ];

    const recentTools = showTools ? toolCalls.slice(-4) : [];
    recentTools.forEach((t, i) => {
      nodes.push({
        id: `tool-${t.callId}`,
        type: "agent",
        position: { x: 120 + i * 165, y: -30 },
        data: {
          title: t.toolName,
          subtitle: t.latencyMs ? `${t.latencyMs}ms` : "running…",
          status: t.status === "failed" ? "failed" : t.status === "done" ? "done" : "running",
          accent: "text-bone",
          role: "Tool",
        },
      });
    });

    const edges: Edge[] = [
      { id: "v-n", source: "vergil", target: "nero", className: status(nero) === "running" ? "edge-active" : "" },
      { id: "n-l", source: "nero", target: "lady", className: status(lady) === "running" ? "edge-active" : "" },
      { id: "l-t", source: "lady", target: "trish", className: anyFail ? "edge-active" : "", style: { opacity: anyFail ? 1 : 0.25 } },
      { id: "t-v", source: "trish", target: "vergil", style: { opacity: anyFail ? 1 : 0.25 } },
      ...recentTools.map((t) => ({
        id: `e-tool-${t.callId}`,
        source: "nero",
        target: `tool-${t.callId}`,
        className: t.status === "running" ? "edge-active" : "",
      })),
    ];

    return { nodes, edges };
  }, [agentSteps, toolCalls, showTools]);

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync the computed layout into state by MERGING onto existing nodes, never
  // replacing them wholesale. Spreading the previous node preserves React
  // Flow's internally-attached `measured` dimensions — overwriting them every
  // stream tick strips those dims, which makes fitView collapse to an empty
  // viewport and the graph go blank mid-run. We update only data/edges-class
  // and (when locked) the tidy position; a dragged node keeps its position.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return computed.nodes.map((cn) => {
        const p = prevById.get(cn.id);
        if (!p) return cn; // new node — nothing measured yet, use as-is
        return {
          ...p, // keep measured dims, selection, etc.
          data: cn.data,
          className: cn.className,
          position: draggable ? p.position : cn.position,
        };
      });
    });
  }, [computed.nodes, draggable, setNodes]);
  useEffect(() => {
    setEdges(computed.edges);
  }, [computed.edges, setEdges]);

  // Auto-fit only while the layout is machine-managed (locked). Once the user
  // is dragging, leave their framing alone.
  useEffect(() => {
    if (!inst || draggable) return;
    const t = setTimeout(() => inst.fitView({ padding: 0.25, duration: 250 }), 50);
    return () => clearTimeout(t);
  }, [inst, computed.nodes.length, draggable]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AgentFlowNode) => setSelected(node.data),
    [],
  );

  return (
    <div className="h-72 min-h-72 w-full sm:h-80">
      <ReactFlow
        onInit={setInst}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: false }}
        nodesDraggable={draggable}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll={scrollZoom}
        zoomOnPinch
        minZoom={0.4}
        maxZoom={2}
        preventScrolling={scrollZoom}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1d2738" />

        <Controls
          showInteractive={false}
          className="agent-graph-controls"
          fitViewOptions={{ padding: 0.25 }}
        />

        {showMap && (
          <MiniMap
            pannable
            zoomable
            className="agent-graph-map"
            maskColor="rgba(10,13,20,0.72)"
            nodeStrokeWidth={2}
            nodeColor={(n) => ACCENT_HEX[(n.data as AgentNodeData)?.accent] ?? "#1d2738"}
          />
        )}

        <Panel position="top-right" className="!m-2">
          <div className="flex flex-wrap justify-end gap-1">
            <GraphToggle on={draggable} onClick={() => setDraggable((v) => !v)}>
              DRAG
            </GraphToggle>
            <GraphToggle on={showTools} onClick={() => setShowTools((v) => !v)}>
              TOOLS
            </GraphToggle>
            <GraphToggle on={showMap} onClick={() => setShowMap((v) => !v)}>
              MAP
            </GraphToggle>
            <GraphToggle on={scrollZoom} onClick={() => setScrollZoom((v) => !v)}>
              ZOOM
            </GraphToggle>
            <button
              onClick={() => inst?.fitView({ padding: 0.25, duration: 250 })}
              className="press font-mono cut-sm border border-edge bg-panel/80 px-2 py-1 text-[9px] tracking-widest text-mist transition hover:text-bone"
            >
              FIT
            </button>
          </div>
        </Panel>

        {selected && (
          <Panel position="top-left" className="!m-2">
            <div className="palette-pop cut-sm w-52 border border-edge bg-panel/95 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className={`font-display text-sm font-bold italic ${selected.accent}`}>
                  {selected.title}
                </p>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="font-mono text-[9px] tracking-widest text-mist transition hover:text-bone"
                >
                  ESC
                </button>
              </div>
              {selected.role && (
                <p className="font-mono mt-0.5 text-[9px] tracking-widest text-mist">
                  {selected.role.toUpperCase()}
                </p>
              )}
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between gap-3">
                  <dt className="font-mono text-[9px] tracking-widest text-mist">STATUS</dt>
                  <dd
                    className={`font-mono text-[9px] tracking-widest ${
                      selected.status === "failed"
                        ? "text-crimson"
                        : selected.status === "running" || selected.status === "done"
                          ? "text-spectral"
                          : "text-mist"
                    }`}
                  >
                    {selected.status.toUpperCase()}
                  </dd>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-bone/80">
                  {selected.subtitle}
                </p>
              </dl>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

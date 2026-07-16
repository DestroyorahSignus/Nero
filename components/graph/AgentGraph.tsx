"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import type { AgentStepData, ToolCallData, StepStatus } from "@/ai/types";

/* ── Custom node ─────────────────────────────────────────────────── */

type AgentNodeData = {
  title: string;
  subtitle: string;
  status: StepStatus;
  accent: string; // tailwind text color class
};
type AgentFlowNode = Node<AgentNodeData, "agent">;

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const stateClass =
    data.status === "running"
      ? "node-running"
      : data.status === "failed"
        ? "node-failed"
        : data.status === "done"
          ? "node-done"
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
      className={`cut-sm min-w-36 border border-edge bg-panel px-4 py-3 ${stateClass}`}
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

/* ── Graph builder ───────────────────────────────────────────────── */

export function AgentGraph({
  agentSteps,
  toolCalls,
}: {
  agentSteps: AgentStepData[];
  toolCalls: ToolCallData[];
}) {
  const { nodes, edges } = useMemo(() => {
    const latest = (agent: string): AgentStepData | undefined =>
      [...agentSteps].reverse().find((s) => s.agent === agent);

    const vergil = latest("VERGIL");
    const nero = latest("NERO");
    const lady = latest("LADY");
    const anyFail = lady?.status === "failed";

    const status = (s?: AgentStepData): StepStatus => s?.status ?? "pending";

    const nodes: AgentFlowNode[] = [
      {
        id: "vergil",
        type: "agent",
        position: { x: 0, y: 90 },
        data: {
          title: "VERGIL",
          subtitle: vergil?.detail ?? "planner",
          status: status(vergil),
          accent: "text-ember",
        },
      },
      {
        id: "nero",
        type: "agent",
        position: { x: 230, y: 90 },
        data: {
          title: "NERO",
          subtitle: nero?.detail ?? "executor",
          status: status(nero),
          accent: "text-spectral",
        },
      },
      {
        id: "lady",
        type: "agent",
        position: { x: 460, y: 90 },
        data: {
          title: "LADY",
          subtitle: lady?.detail ?? "critic",
          status: status(lady),
          accent: "text-crimson",
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
        },
      },
    ];

    // Tool nodes fan out above NERO — last 4 calls kept visible
    const recentTools = toolCalls.slice(-4);
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
        },
      });
    });

    const edges: Edge[] = [
      {
        id: "v-n",
        source: "vergil",
        target: "nero",
        className: status(nero) === "running" ? "edge-active" : "",
      },
      {
        id: "n-l",
        source: "nero",
        target: "lady",
        className: status(lady) === "running" ? "edge-active" : "",
      },
      {
        id: "l-t",
        source: "lady",
        target: "trish",
        className: anyFail ? "edge-active" : "",
        style: { opacity: anyFail ? 1 : 0.25 },
      },
      {
        id: "t-v",
        source: "trish",
        target: "vergil",
        style: { opacity: anyFail ? 1 : 0.25 },
      },
      ...recentTools.map((t) => ({
        id: `e-tool-${t.callId}`,
        source: "nero",
        target: `tool-${t.callId}`,
        className: t.status === "running" ? "edge-active" : "",
      })),
    ];

    return { nodes, edges };
  }, [agentSteps, toolCalls]);

  return (
    <div className="h-full min-h-72 w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: false }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        preventScrolling={false}
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#1d2738"
        />
      </ReactFlow>
    </div>
  );
}

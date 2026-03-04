'use client';

import * as React from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolActivityRow } from './tool-activity-row';
import { ToolActivityIcon } from './tool-activity-icon';
import type { AgentActivityNode, ToolActivity } from '@/lib/tool-activity';
import { getActivityDuration, formatDuration } from '@/lib/tool-display';

// ============================================================================
// 辅助：从 Task 工具 input 提取 subagent 名称
// ============================================================================

function getSubagentName(activity: ToolActivity): string {
  const input = activity.toolInput;
  if (!input) return 'Subagent';
  if (typeof input.subagent_type === 'string') return input.subagent_type;
  if (typeof input.description === 'string') {
    // 截断长描述
    return input.description.length > 40
      ? input.description.slice(0, 40) + '…'
      : input.description;
  }
  return 'Subagent';
}

// ============================================================================
// SubagentNode — Task 工具对应的可折叠 subagent 节点
// ============================================================================

interface SubagentNodeProps {
  node: AgentActivityNode;
  defaultExpanded?: boolean;
}

function SubagentNode({ node, defaultExpanded = true }: SubagentNodeProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const { activity, children } = node;

  const agentName = getSubagentName(activity);
  const isRunning = activity.status === 'running' || children.some((c) => c.activity.status === 'running');
  const hasError = activity.status === 'error';

  // 整个 subagent 节点的状态：取 Task 工具本身的状态
  const overallStatus = activity.status;

  // 时长：Task 工具从开始到完成
  const duration = getActivityDuration(activity);
  const durationLabel = duration !== null ? formatDuration(duration) : null;

  // 实时更新运行中 subagent 的耗时
  const [elapsed, setElapsed] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (overallStatus !== 'running') return;
    const update = () => setElapsed(getActivityDuration(activity));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activity, overallStatus]);

  const displayDuration = overallStatus === 'running'
    ? (elapsed !== null ? formatDuration(elapsed) : null)
    : durationLabel;

  return (
    <div className="my-1">
      {/* Subagent 头部行 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] transition-colors',
          'hover:bg-muted/50',
          hasError ? 'text-destructive' : 'text-foreground/80',
        )}
      >
        {/* 折叠图标 */}
        {children.length > 0 ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}

        {/* Agent 状态图标 */}
        <ToolActivityIcon status={overallStatus} toolName="Task" />

        {/* Agent 大脑图标 + 名称 */}
        <Brain className="h-3 w-3 shrink-0 text-violet-500" />
        <span className="font-semibold text-violet-600 dark:text-violet-400">
          {agentName}
        </span>

        {/* 子工具数量 */}
        {children.length > 0 && (
          <span className="text-[11px] text-muted-foreground opacity-70">
            {children.length} tool{children.length > 1 ? 's' : ''}
          </span>
        )}

        {/* 运行中脉冲 */}
        {isRunning && (
          <span className="ml-1 flex items-center gap-1 text-[11px] text-blue-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            running
          </span>
        )}

        {/* 时长 */}
        {displayDuration && !isRunning && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground opacity-60">
            ({displayDuration})
          </span>
        )}
        {displayDuration && isRunning && (
          <span className="ml-auto text-[11px] tabular-nums text-blue-500/70">
            {displayDuration}
          </span>
        )}
      </button>

      {/* 子工具列表 */}
      {expanded && children.length > 0 && (
        <div className="ml-6 mt-0.5 border-l border-border/40 pl-3">
          {children.map((child) => (
            <ToolActivityRow
              key={child.activity.id}
              activity={child.activity}
              showDuration
              className="py-0.5"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AgentTeamView — 主组件
// ============================================================================

export interface AgentTeamViewProps {
  /** 树形活动节点（来自 ToolActivityManager.getActivityTree()） */
  nodes: AgentActivityNode[];
  /** 是否显示主 Agent 标题行 */
  showMainAgentHeader?: boolean;
  /** 额外 className */
  className?: string;
}

/**
 * AgentTeamView — 可折叠的 Agent Teams 树形视图
 *
 * 层级结构：
 * ```
 * 🧠 Main Agent
 * ├── 📄 Read: path/to/file          ✅ 234ms
 * ├── 🤖 code-reviewer               ⏳ running
 * │   ├── 🔍 Grep: pattern           ✅ 145ms
 * │   └── 📄 Read: file.ts           ✅ 89ms
 * └── 🤖 test-runner                 ✅ 1200ms
 *     └── 💻 Bash: pnpm test         ✅ 1200ms
 * ```
 */
export function AgentTeamView({ nodes, showMainAgentHeader = true, className }: AgentTeamViewProps) {
  if (nodes.length === 0) return null;

  // 判断是否有 subagent（Task 工具节点）
  const hasSubagents = nodes.some((n) => n.activity.toolName === 'Task' && n.children.length > 0);

  // 是否有任何活动在运行
  const anyRunning = nodes.some(
    (n) => n.activity.status === 'running' || n.children.some((c) => c.activity.status === 'running'),
  );

  return (
    <div className={cn('space-y-0.5', className)}>
      {/* 主 Agent 标题行（只在有 subagent 时显示，避免无意义的嵌套） */}
      {showMainAgentHeader && hasSubagents && (
        <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-foreground/70">
          <Brain className="h-3.5 w-3.5 text-violet-500" />
          <span>Main Agent</span>
          {anyRunning && (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          )}
        </div>
      )}

      {/* 渲染每个根节点 */}
      {nodes.map((node) => {
        const isSubagentLauncher = node.activity.toolName === 'Task';

        if (isSubagentLauncher) {
          // Task 工具 → 渲染为可折叠的 subagent 节点
          return (
            <SubagentNode
              key={node.activity.id}
              node={node}
              defaultExpanded
            />
          );
        }

        // 普通工具 → 直接渲染为行
        return (
          <ToolActivityRow
            key={node.activity.id}
            activity={node.activity}
            showDuration
            className={cn(hasSubagents && 'ml-1')}
          />
        );
      })}
    </div>
  );
}

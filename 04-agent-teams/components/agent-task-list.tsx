'use client';

import * as React from 'react';
import {
  CheckCircle2, Circle, Loader2, Clock, ChevronDown, ChevronUp, ArrowRight,
  MessageSquare, BellOff, PowerOff, CheckCheck, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskItem, TeamConfig, ParsedMailboxMessage } from '@/app/api/agent-teams/route';

// ============================================================================
// TaskRow
// ============================================================================

interface TaskRowProps {
  task: TaskItem;
  members: TeamConfig['members'];
}

function TaskStatusIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 text-blue-500 animate-spin" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />;
}

function TaskRow({ task, members }: TaskRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const ownerMember = members.find((m) => m.name === task.owner);
  const isBlocked = task.status === 'pending' && task.blockedBy.length > 0;

  const rowColor =
    task.status === 'completed'
      ? 'text-muted-foreground/60'
      : task.status === 'in_progress'
      ? 'text-foreground'
      : isBlocked
      ? 'text-muted-foreground/40'
      : 'text-muted-foreground/70';

  return (
    <div className={cn('group space-y-1', rowColor)}>
      <div className="flex items-start gap-2">
        <TaskStatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'text-[12px] font-medium leading-tight',
                task.status === 'completed' && 'line-through opacity-60',
              )}
            >
              #{task.id} {task.subject}
            </span>

            {/* 进行中：显示 activeForm */}
            {task.status === 'in_progress' && task.activeForm && (
              <span className="text-[11px] italic text-blue-500/80">{task.activeForm}</span>
            )}

            {/* 责任人 */}
            {task.owner && (
              <span
                className={cn(
                  'inline-flex items-center rounded px-1 py-0 text-[10px] font-mono',
                  'bg-muted/50 text-muted-foreground/70',
                )}
              >
                {ownerMember?.color ? (
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: ownerMember.color }}
                  />
                ) : null}
                {task.owner}
              </span>
            )}

            {/* 依赖关系 */}
            {isBlocked && (
              <span className="text-[10px] text-muted-foreground/40">
                等待 #{task.blockedBy.join(', #')}
              </span>
            )}
          </div>

          {/* 描述（可折叠） */}
          {task.description && (
            <>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors mt-0.5"
              >
                {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                {expanded ? '收起' : '详情'}
              </button>
              {expanded && (
                <p className="mt-1 text-[11px] text-muted-foreground/70 leading-snug border-l-2 border-muted pl-2">
                  {task.description}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MailboxTimeline
// ============================================================================

interface MailboxTimelineProps {
  inboxes: Record<string, ParsedMailboxMessage[]>;
  members: TeamConfig['members'];
}

function getMailboxIcon(parsedType: ParsedMailboxMessage['parsedType']) {
  switch (parsedType) {
    case 'idle_notification': return <BellOff className="h-2.5 w-2.5" />;
    case 'shutdown_request': return <PowerOff className="h-2.5 w-2.5" />;
    case 'shutdown_approved': return <CheckCheck className="h-2.5 w-2.5" />;
    case 'task_assignment': return <Send className="h-2.5 w-2.5" />;
    default: return <MessageSquare className="h-2.5 w-2.5" />;
  }
}

function getMailboxLabel(msg: ParsedMailboxMessage): string {
  switch (msg.parsedType) {
    case 'idle_notification': return `空闲通知${msg.idleReason ? `（${msg.idleReason}）` : ''}`;
    case 'shutdown_request': return '收到关闭请求';
    case 'shutdown_approved': return 'Agent 已关闭';
    case 'task_assignment': return '任务分配';
    default: return msg.summary || msg.text.slice(0, 60) + (msg.text.length > 60 ? '…' : '');
  }
}

function getMailboxColor(msg: ParsedMailboxMessage): string {
  switch (msg.parsedType) {
    case 'idle_notification': return 'text-amber-500/70';
    case 'shutdown_request': return 'text-orange-500/70';
    case 'shutdown_approved': return 'text-emerald-500/70';
    case 'task_assignment': return 'text-blue-500/70';
    default: return 'text-muted-foreground/60';
  }
}

function MailboxTimeline({ inboxes, members }: MailboxTimelineProps) {
  const [collapsed, setCollapsed] = React.useState(true);

  // 合并所有收件箱消息，附上目标 Agent 名
  interface FlatMessage extends ParsedMailboxMessage {
    toAgent: string;
  }

  const allMessages: FlatMessage[] = Object.entries(inboxes).flatMap(([agentName, msgs]) =>
    msgs.map((m) => ({ ...m, toAgent: agentName }))
  );

  // 按时间戳排序（有的话）
  allMessages.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.localeCompare(b.timestamp);
  });

  // 过滤掉 idle_notification（太频繁，只统计数量）
  const idleCount = allMessages.filter((m) => m.parsedType === 'idle_notification').length;
  const significant = allMessages.filter((m) => m.parsedType !== 'idle_notification');

  if (allMessages.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border/30 pt-2">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <MessageSquare className="h-2.5 w-2.5 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/60">Agent 通信</span>
        <span className="text-[10px] text-muted-foreground/40">
          {significant.length} 条消息{idleCount > 0 ? `，${idleCount} 次空闲通知` : ''}
        </span>
        <ArrowRight
          className={cn('h-2.5 w-2.5 text-muted-foreground/40 ml-auto transition-transform', !collapsed && 'rotate-90')}
        />
      </button>

      {!collapsed && (
        <div className="mt-1.5 space-y-1 pl-4 border-l border-border/30">
          {significant.map((msg, idx) => {
            const fromMember = members.find((m) => m.name === msg.from);
            const toMember = members.find((m) => m.name === msg.toAgent);
            const color = getMailboxColor(msg);
            const label = getMailboxLabel(msg);

            return (
              <div key={idx} className={cn('flex items-start gap-1.5', color)}>
                <span className="mt-0.5 shrink-0">{getMailboxIcon(msg.parsedType)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 发件人 */}
                    <span className="text-[10px] font-mono">
                      {fromMember?.color && (
                        <span
                          className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: fromMember.color }}
                        />
                      )}
                      {msg.from}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30">→</span>
                    {/* 收件人 */}
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {toMember?.color && (
                        <span
                          className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: toMember.color }}
                        />
                      )}
                      {msg.toAgent}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight">{label}</p>
                </div>
              </div>
            );
          })}

          {idleCount > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground/30">
              <BellOff className="h-2.5 w-2.5 shrink-0" />
              <span className="text-[10px]">+ {idleCount} 次空闲通知（已折叠）</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AgentTaskList
// ============================================================================

export interface AgentTaskListProps {
  teamName: string;
  team: TeamConfig;
  tasks: TaskItem[];
  inboxes?: Record<string, ParsedMailboxMessage[]>;
  className?: string;
}

export function AgentTaskList({ teamName, team, tasks, inboxes, className }: AgentTaskListProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  const hasInboxes = inboxes && Object.keys(inboxes).length > 0;
  if (tasks.length === 0 && !hasInboxes) return null;

  const pending = tasks.filter((t) => t.status === 'pending').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const completed = tasks.filter((t) => t.status === 'completed').length;

  // 按状态排序：in_progress > pending > completed
  const sorted = [...tasks].sort((a, b) => {
    const order = { in_progress: 0, pending: 1, completed: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className={cn('rounded-lg border border-border/50 bg-background/60 p-3 space-y-2', className)}>
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <ArrowRight
            className={cn('h-3 w-3 text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
          />
          <span className="text-[12px] font-semibold text-foreground/80">{teamName}</span>
          {tasks.length > 0 && (
            <span className="text-[11px] text-muted-foreground/60">{tasks.length} tasks</span>
          )}
        </button>

        {/* 进度指示器 */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] tabular-nums shrink-0">
            {inProgress > 0 && (
              <span className="flex items-center gap-1 text-blue-500">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                {inProgress} 进行中
              </span>
            )}
            {pending > 0 && (
              <span className="text-muted-foreground/50">{pending} 待处理</span>
            )}
            {completed > 0 && (
              <span className="text-emerald-500">{completed} 完成</span>
            )}
          </div>
        )}

        {/* 完成进度条 */}
        {tasks.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/40" />
            <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.round((completed / tasks.length) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/50">
              {Math.round((completed / tasks.length) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* 任务列表 */}
      {!collapsed && (
        <>
          {sorted.length > 0 && (
            <div className="space-y-2 pl-5">
              {sorted.map((task) => (
                <TaskRow key={task.id} task={task} members={team.members} />
              ))}
            </div>
          )}

          {/* Agent 通信时间线 */}
          {hasInboxes && (
            <MailboxTimeline inboxes={inboxes} members={team.members} />
          )}
        </>
      )}
    </div>
  );
}

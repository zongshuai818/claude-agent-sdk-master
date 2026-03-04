import type { AgentEvent, TaskUsage } from '@04-agent-teams/shared/agent';

// ============================================================================
// 类型定义
// ============================================================================

export type TeammateStatus = 'running' | 'completed' | 'failed' | 'stopped';

/**
 * 单个 teammate 的实时状态
 */
export interface TeammateState {
  /** SDK task_id */
  taskId: string;
  /** 关联的 tool_use_id（Task 工具调用 ID） */
  toolUseId?: string;
  /** 任务描述（spawn 时 Claude 给出的说明） */
  description: string;
  /** 任务类型（SDK 内部类型，如 in_process_teammate） */
  taskType?: string;
  /** 在当前对话中的序号（从 1 开始） */
  index: number;
  /** 当前状态 */
  status: TeammateStatus;
  /** 最近一次 task_progress 的描述（实时思考内容） */
  progressDescription?: string;
  /** 当前正在运行的工具名 */
  currentToolName?: string;
  /** 当前工具已运行秒数 */
  currentToolElapsedSeconds?: number;
  /** 当前工具 toolUseId */
  currentToolUseId?: string;
  /** 已使用的工具历史记录（最近 N 个，去重） */
  toolHistory: string[];
  /** 完成时的摘要 */
  summary?: string;
  /** 完成时输出文件路径 */
  outputFile?: string;
  /** 累计用量 */
  usage?: TaskUsage;
  /** 开始时间戳 */
  startedAt: number;
  /** 结束时间戳 */
  endedAt?: number;
}

/** 工具历史最大记录数 */
const MAX_TOOL_HISTORY = 20;

// ============================================================================
// AgentTeamStore
// ============================================================================

/**
 * AgentTeamStore — 管理所有 teammate 的实时状态
 *
 * 消费 AgentEvent 中的 task_* 和 tool_progress 事件，
 * 维护每个 teammate 的状态，供前端 split 视图渲染。
 */
export class AgentTeamStore {
  private teammates = new Map<string, TeammateState>();
  private listeners: Array<(teammates: TeammateState[]) => void> = [];

  handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'task_started':
        this.teammates.set(event.taskId, {
          taskId: event.taskId,
          toolUseId: event.toolUseId,
          description: event.description,
          taskType: event.taskType,
          index: this.teammates.size + 1,
          status: 'running',
          toolHistory: [],
          startedAt: Date.now(),
        });
        this.notify();
        break;

      case 'task_progress': {
        const tm = this.teammates.get(event.taskId);
        if (tm) {
          // 收到 task_progress 说明 teammate 仍在工作
          // 若之前被标记为 stopped（如等待数据时短暂停止），重置回 running
          if (tm.status === 'stopped' || tm.status === 'failed') {
            tm.status = 'running';
            tm.endedAt = undefined;
          }
          tm.progressDescription = event.description;
          tm.usage = event.usage;
          // 追加到工具历史
          if (event.lastToolName) {
            tm.currentToolName = event.lastToolName;
            appendToolHistory(tm.toolHistory, event.lastToolName);
          }
          this.notify();
        }
        break;
      }

      case 'task_notification': {
        const tm = this.teammates.get(event.taskId);
        if (tm) {
          tm.status = event.status;
          tm.summary = event.summary;
          tm.outputFile = event.outputFile;
          tm.endedAt = Date.now();
          if (event.usage) tm.usage = event.usage;
          // 任务结束后清除实时工具状态
          tm.currentToolName = undefined;
          tm.currentToolElapsedSeconds = undefined;
          tm.currentToolUseId = undefined;
          this.notify();
        }
        break;
      }

      case 'tool_progress': {
        if (!event.taskId) break;
        const tm = this.teammates.get(event.taskId);
        if (tm) {
          // 收到 tool_progress 说明 teammate 在执行工具，重置 stopped 状态
          if (tm.status === 'stopped') {
            tm.status = 'running';
            tm.endedAt = undefined;
          }
          if (tm.status === 'running') {
            tm.currentToolName = event.toolName;
            tm.currentToolElapsedSeconds = event.elapsedSeconds;
            tm.currentToolUseId = event.toolUseId;
            appendToolHistory(tm.toolHistory, event.toolName);
            this.notify();
          }
        }
        break;
      }

      default:
        break;
    }
  }

  getTeammates(): TeammateState[] {
    return Array.from(this.teammates.values()).sort((a, b) => a.startedAt - b.startedAt);
  }

  hasTeam(): boolean {
    return this.teammates.size > 0;
  }

  clear(): void {
    this.teammates.clear();
    this.notify();
  }

  /**
   * 将所有仍处于 running 状态的 teammate 标记为 stopped。
   * 在主对话 complete 事件触发时调用，作为 task_notification 未到达的兜底。
   */
  finalizeRunning(): void {
    let changed = false;
    for (const tm of this.teammates.values()) {
      if (tm.status === 'running') {
        tm.status = 'stopped';
        tm.endedAt = Date.now();
        tm.currentToolName = undefined;
        tm.currentToolElapsedSeconds = undefined;
        tm.currentToolUseId = undefined;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  subscribe(listener: (teammates: TeammateState[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i > -1) this.listeners.splice(i, 1);
    };
  }

  private notify(): void {
    const teammates = this.getTeammates();
    this.listeners.forEach((l) => l(teammates));
  }
}

/**
 * 追加工具名到历史记录，相同工具不连续重复，超出上限则删除最旧的
 */
function appendToolHistory(history: string[], toolName: string): void {
  if (history[history.length - 1] === toolName) return;
  history.push(toolName);
  if (history.length > MAX_TOOL_HISTORY) {
    history.shift();
  }
}

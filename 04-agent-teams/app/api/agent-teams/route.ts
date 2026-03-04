import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams');
const TASKS_DIR = path.join(os.homedir(), '.claude', 'tasks');

export interface TeamConfig {
  name: string;
  description?: string;
  createdAt: number;
  leadAgentId?: string;
  leadSessionId?: string;
  members: TeamMember[];
}

export interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model?: string;
  prompt?: string;
  color?: string;
  joinedAt?: number;
  backendType?: string;
}

export interface TaskItem {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks: string[];
  blockedBy: string[];
  metadata?: Record<string, unknown>;
}

export interface MailboxMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp?: string;
  color?: string;
  read?: boolean;
}

export interface ParsedMailboxMessage extends MailboxMessage {
  /** 解析后的消息类型 */
  parsedType?: 'idle_notification' | 'shutdown_request' | 'shutdown_approved' | 'task_assignment' | 'text';
  /** idle_notification 的原因 */
  idleReason?: string;
}

export interface AgentTeamData {
  teamName: string;
  team: TeamConfig;
  tasks: TaskItem[];
  /** 各 Agent 的收件箱消息: agentName → messages */
  inboxes: Record<string, ParsedMailboxMessage[]>;
}

/**
 * 根据 sessionId 找到对应的 Agent Team，并返回任务列表
 * GET /api/agent-teams?sessionId=xxx
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  try {
    // 扫描所有 team，找到 leadSessionId 匹配的
    const teamData = await findTeamBySessionId(sessionId);
    if (!teamData) {
      return Response.json({ team: null, tasks: [] });
    }

    return Response.json(teamData);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function findTeamBySessionId(sessionId: string): Promise<AgentTeamData | null> {
  let teamEntries: string[];
  try {
    teamEntries = await fs.readdir(TEAMS_DIR);
  } catch {
    return null; // ~/.claude/teams 不存在
  }

  for (const teamName of teamEntries) {
    const configPath = path.join(TEAMS_DIR, teamName, 'config.json');
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const config: TeamConfig = JSON.parse(raw);

      if (config.leadSessionId === sessionId) {
        // 找到了匹配的 team，读取任务列表和收件箱
        const tasks = await readTasksForTeam(teamName);
        const inboxes = await readInboxesForTeam(teamName);
        return { teamName, team: config, tasks, inboxes };
      }
    } catch {
      continue; // 跳过解析失败的 team
    }
  }

  return null;
}

async function readTasksForTeam(teamName: string): Promise<TaskItem[]> {
  const tasksDir = path.join(TASKS_DIR, teamName);
  let files: string[];
  try {
    files = await fs.readdir(tasksDir);
  } catch {
    return [];
  }

  const jsonFiles = files
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort((a, b) => {
      // 按数字顺序排序：1.json < 2.json < 10.json
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

  const tasks: TaskItem[] = [];
  for (const file of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(tasksDir, file), 'utf-8');
      const task: TaskItem = JSON.parse(raw);
      tasks.push(task);
    } catch {
      continue;
    }
  }

  return tasks;
}

async function readInboxesForTeam(teamName: string): Promise<Record<string, ParsedMailboxMessage[]>> {
  const inboxesDir = path.join(TEAMS_DIR, teamName, 'inboxes');
  let files: string[];
  try {
    files = await fs.readdir(inboxesDir);
  } catch {
    return {};
  }

  const result: Record<string, ParsedMailboxMessage[]> = {};

  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    const agentName = file.replace(/\.json$/, '');
    try {
      const raw = await fs.readFile(path.join(inboxesDir, file), 'utf-8');
      const messages: MailboxMessage[] = JSON.parse(raw);
      result[agentName] = messages.map(parseMailboxMessage);
    } catch {
      continue;
    }
  }

  return result;
}

function parseMailboxMessage(msg: MailboxMessage): ParsedMailboxMessage {
  // 尝试解析结构化 JSON 消息
  try {
    const parsed = JSON.parse(msg.text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      const msgType = parsed.type;
      if (msgType === 'idle_notification') {
        return { ...msg, parsedType: 'idle_notification', idleReason: typeof parsed.idleReason === 'string' ? parsed.idleReason : undefined };
      }
      if (msgType === 'shutdown_request') {
        return { ...msg, parsedType: 'shutdown_request' };
      }
      if (msgType === 'shutdown_approved') {
        return { ...msg, parsedType: 'shutdown_approved' };
      }
      if (msgType === 'task_assignment') {
        return { ...msg, parsedType: 'task_assignment' };
      }
    }
  } catch {
    // 不是 JSON，当普通文本处理
  }
  return { ...msg, parsedType: 'text' };
}

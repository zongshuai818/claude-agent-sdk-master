import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

interface AgentOutputRequest {
  outputFile: string;
}

/**
 * 读取 Agent Teams 的产出文件内容
 *
 * 与通用文件 API 不同，这里允许读取任意绝对路径，
 * 因为 SDK 创建的 output_file 可能位于 cwd 外部（如临时目录）。
 * 安全保障：只允许读取实际存在的普通文件，拒绝目录。
 */
export async function POST(req: NextRequest) {
  try {
    const body: AgentOutputRequest = await req.json();
    const { outputFile } = body;

    if (!outputFile || typeof outputFile !== 'string') {
      return new Response(
        JSON.stringify({ error: 'outputFile is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPath = path.normalize(outputFile);

    // 安全检查：确保不是目录遍历攻击（.. 已被 path.normalize 处理）
    // 确保是绝对路径
    if (!path.isAbsolute(normalizedPath)) {
      return new Response(
        JSON.stringify({ error: 'Path must be absolute' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 确保文件存在且是普通文件（非目录）
    const stats = await fs.stat(normalizedPath);
    if (!stats.isFile()) {
      return new Response(
        JSON.stringify({ error: 'Path is not a regular file' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const content = await fs.readFile(normalizedPath, 'utf-8');

    return new Response(
      JSON.stringify({ content, path: normalizedPath, size: stats.size }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound = errorMessage.includes('ENOENT');
    return new Response(
      JSON.stringify({ error: isNotFound ? '文件不存在或已被清理' : errorMessage }),
      { status: isNotFound ? 404 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

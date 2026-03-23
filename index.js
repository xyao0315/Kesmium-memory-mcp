const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MEMORY_FILE = path.join(__dirname, 'memories.json');

async function initMemoryFile() {
  try {
    await fs.access(MEMORY_FILE);
  } catch (err) {
    await fs.writeFile(MEMORY_FILE, JSON.stringify([]), 'utf8');
  }
}

async function getMemories(filters = {}) {
  const data = await fs.readFile(MEMORY_FILE, 'utf8');
  let memories = JSON.parse(data);
  if (filters.category) memories = memories.filter(m => m.category === filters.category);
  if (filters.keyword) memories = memories.filter(m => m.content.includes(filters.keyword));
  return memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function addMemory(content, category = '日常', tags = []) {
  const memories = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
  const newMemory = {
    id: Date.now().toString(),
    content,
    category,
    tags,
    timestamp: new Date().toLocaleString('zh-CN'),
    createTime: Date.now()
  };
  memories.push(newMemory);
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  return newMemory;
}

async function updateMemory(id, updates) {
  const memories = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
  const index = memories.findIndex(m => m.id === id);
  if (index === -1) throw new Error('记忆不存在');
  memories[index] = { ...memories[index], ...updates, updateTime: Date.now() };
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  return memories[index];
}

async function deleteMemory(id) {
  let memories = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
  memories = memories.filter(m => m.id !== id);
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  return true;
}

app.get('/.well-known/mcp', (req, res) => {
  res.json({
    name: "my-claude-memory",
    version: "1.0.0",
    description: "我的专属记忆库",
    tools: [
      {
        name: "add_memory",
        description: "写入新记忆",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
            category: { type: "string", enum: ["深层", "日常", "日记", "写文"] },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["content"]
        }
      },
      {
        name: "get_memories",
        description: "读取记忆",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            keyword: { type: "string" }
          }
        }
      },
      {
        name: "update_memory",
        description: "更新记忆",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" }
          },
          required: ["id", "content"]
        }
      },
      {
        name: "delete_memory",
        description: "删除记忆",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        }
      },
      {
        name: "get_memory_stats",
        description: "获取记忆库统计"
      }
    ]
  });
});

app.post('/mcp/execute', async (req, res) => {
  const { name, arguments: args } = req.body;
  try {
    let result;
    switch (name) {
      case "add_memory":
        result = await addMemory(args.content, args.category, args.tags);
        break;
      case "get_memories":
        result = await getMemories(args || {});
        break;
      case "update_memory":
        result = await updateMemory(args.id, args);
        break;
      case "delete_memory":
        result = await deleteMemory(args.id);
        break;
      case "get_memory_stats":
        const memories = await getMemories();
        const categoryStats = {};
        memories.forEach(m => categoryStats[m.category] = (categoryStats[m.category] || 0) + 1);
        result = { total: memories.length, categoryStats, latest: memories[0] || null };
        break;
      default:
        throw new Error(`未知工具：${name}`);
    }
    res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/memories', async (req, res) => res.json(await getMemories(req.query)));
app.post('/api/memories', async (req, res) => res.json(await addMemory(req.body.content, req.body.category, req.body.tags)));

initMemoryFile().then(() => {
  app.listen(PORT, () => console.log(`服务已启动，端口：${PORT}`));
});

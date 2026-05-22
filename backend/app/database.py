from typing import Dict, List, Any

# 模拟关系型数据库 (PostgreSQL/MySQL) 的 sessions 和 messages 表
# 支撑多会话并行与上下文连续
DB_SESSIONS: Dict[str, Dict[str, Any]] = {}
DB_MESSAGES: Dict[str, List[Dict[str, Any]]] = {}

def get_chat_history(session_id: str) -> List[Dict[str, str]]:
    """获取格式化为 OpenAI 格式的上下文历史"""
    messages = DB_MESSAGES.get(session_id, [])
    openai_msgs = []
    for msg in messages:
        # 只把文本类型塞进大模型的上下文
        if msg["type"] in ["text", "chunk"] and msg["content"]:
            openai_msgs.append({"role": msg["role"], "content": msg["content"]})
    return openai_msgs

def save_message(session_id: str, role: str, agent_name: str, content: str, msg_type: str = "text"):
    """持久化消息到内存库"""
    if session_id not in DB_MESSAGES:
        DB_MESSAGES[session_id] = []
    DB_MESSAGES[session_id].append({
        "role": role,
        "agent": agent_name,
        "content": content,
        "type": msg_type
    })
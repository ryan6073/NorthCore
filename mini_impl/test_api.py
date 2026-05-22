import os
from openai import OpenAI

# 1. 初始化客户端
# 火山方舟平台的标准 Base URL 为 https://ark.cn-beijing.volces.com/api/v3
client = OpenAI(
    api_key="ark-3a6a7711-6bc2-444d-9572-f9e1887a7aab-40a6c",
    base_url="https://ark.cn-beijing.volces.com/api/v3"
)

# 2. 发起流式（Stream）或非流式请求
try:
    print("--- 开始请求流式输出 ---")
    response = client.chat.completions.create(
        # CRITICAL: 火山引擎中，model 字段必须传入你的接入点实例 ID (EP)
        model="ep-20260508214225-g6x7g", 
        messages=[
            {"role": "system", "content": "你是一个严谨 cyclic 的学术助手。"},
            {"role": "user", "content": "请简述什么是大模型的 Agentic Workflow。"}
        ],
        stream=True  # 开启流式传输，体验更流畅
    )

    # 3. 打印流式回包
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            print(chunk.choices[0].delta.content, end="", flush=True)
    print("\n--- 请求结束 ---")

except Exception as e:
    print(f"\n❌ 请求发生错误: {e}")
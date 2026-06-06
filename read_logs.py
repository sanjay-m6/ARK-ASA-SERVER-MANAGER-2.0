import json
import os

log_path = r"C:\Users\sanja\.gemini\antigravity-ide\brain\a85efdcb-289e-4d41-9be5-026a0b3a5ce8\.system_generated\logs\transcript.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            content_str = str(data.get("content", ""))
            tool_calls = str(data.get("tool_calls", ""))
            if "Dashboard.tsx" in content_str or "Dashboard.tsx" in tool_calls:
                print(f"Step {data.get('step_index')}, Type: {data.get('type')}")
        except Exception as e:
            pass

def build_note_blocks(notes: list, char_budget: int = 18000, limit: int = 24) -> list[str]:
    note_blocks = []
    current_chars = 0
    for index, note in enumerate(notes[:limit], start=1):
        block = f"[{index}] 标题：{note.title or '无标题'}\n创建时间：{note.created_at}\n内容：\n{note.content.strip()}\n"
        if current_chars + len(block) > char_budget and note_blocks:
            break
        note_blocks.append(block)
        current_chars += len(block)
    return note_blocks


def build_summary_prompt(note_blocks: list[str]) -> str:
    return (
        "请使用简体中文，总结下面这些笔记的核心内容。\n"
        "输出结构固定为：\n"
        "1. 总体主题\n"
        "2. 关键洞察（3-5条）\n"
        "3. 可执行事项（如果没有就写“无”）\n"
        "4. 值得回看的原始观点（引用具体笔记编号）\n\n"
        f"笔记内容如下：\n\n{'\n'.join(note_blocks)}"
    )


def build_chat_messages(
    *,
    system_prompt: str,
    note_blocks: list[str],
    history: list,
    user_content: str,
) -> list[dict]:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if note_blocks:
        messages.append({
            "role": "user",
            "content": "以下是当前可参考的笔记上下文，请在回答时自行判断是否需要引用：\n\n" + "\n".join(note_blocks),
        })

    for item in history[-8:]:
        role = "user"
        if isinstance(item, dict):
            role = item.get("role") if item.get("role") in {"user", "assistant", "system"} else "user"
            content = str(item.get("content") or "").strip()
        else:
            content = ""
        if content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_content})
    return messages

import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../shared/api/api-client";

export function ImportPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);

    try {
      const session = await apiClient.createImport({
        type: "text",
        title: String(formData.get("title") ?? ""),
        content: String(formData.get("content") ?? ""),
      });
      navigate(`/ingestions/${session.sessionId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <h1>导入中心</h1>
      <p>先用最小文本导入跑通 Learning OS 的知识整理闭环。</p>
      <form className="card stack" onSubmit={onSubmit}>
        <label htmlFor="title">标题</label>
        <input id="title" name="title" placeholder="例如：React Server Components" required />
        <label htmlFor="content">正文</label>
        <textarea id="content" name="content" placeholder="粘贴文章、笔记或整理后的正文" rows={10} required />
        <button type="submit" disabled={submitting}>
          {submitting ? "整理中..." : "开始整理"}
        </button>
      </form>
    </main>
  );
}

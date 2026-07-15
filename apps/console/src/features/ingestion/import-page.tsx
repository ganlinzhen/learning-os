import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateImportDto } from "@learning-os/contracts";
import { apiClient } from "../../shared/api/api-client";

export function ImportPage() {
  const navigate = useNavigate();
  const [sourceType, setSourceType] = useState<CreateImportDto["type"]>("text");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    const payload: CreateImportDto =
      sourceType === "text"
        ? { type: "text", title, content }
        : sourceType === "url"
          ? { type: "url", ...(title ? { title } : {}), url }
          : { type: "markdown", ...(title ? { title } : {}), content };
    setSubmitting(true);
    setErrorMessage("");

    try {
      const session = await apiClient.createImport(payload);
      navigate(`/ingestions/${session.sessionId}`);
    } catch {
      setErrorMessage("导入失败，请检查输入内容或稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <h1>导入中心</h1>
      <p>选择内容来源，系统会整理可审核的知识点与复习卡片。</p>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <form className="card stack" onSubmit={onSubmit}>
        <fieldset className="stack compact">
          <legend>内容来源</legend>
          <div className="source-options">
            {([
              ["text", "文本"],
              ["url", "URL"],
              ["markdown", "Markdown"],
            ] as const).map(([value, label]) => (
              <label className="source-option" key={value}>
                <input
                  checked={sourceType === value}
                  name="sourceType"
                  onChange={() => setSourceType(value)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="title">标题{sourceType === "text" ? "" : "（可选）"}</label>
        <input
          id="title"
          name="title"
          placeholder="例如：React Server Components"
          required={sourceType === "text"}
        />

        {sourceType === "url" ? (
          <>
            <label htmlFor="url">网页地址</label>
            <input id="url" name="url" placeholder="https://example.com/article" required type="url" />
          </>
        ) : (
          <>
            <label htmlFor="content">{sourceType === "markdown" ? "Markdown 正文" : "正文"}</label>
            <textarea
              id="content"
              name="content"
              placeholder={sourceType === "markdown" ? "# 标题\n\n粘贴 Markdown 内容" : "粘贴文章、笔记或整理后的正文"}
              rows={10}
              required
            />
            {sourceType === "markdown" ? (
              <p className="helper-text">未填写标题时，将默认读取 Markdown 的一级标题。</p>
            ) : null}
          </>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "整理中..." : "开始整理"}
        </button>
      </form>
    </main>
  );
}

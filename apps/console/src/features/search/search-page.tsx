import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../shared/api/api-client";

export function SearchPage() {
  const [results, setResults] = useState<Array<{ id: string; title: string; summary: string }>>([]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("query") ?? "");
    const payload = await apiClient.search(query);
    setResults(payload);
  };

  return (
    <main className="page stack">
      <h1>搜索</h1>
      <form className="card stack" onSubmit={onSubmit}>
        <label htmlFor="query">搜索知识点</label>
        <input id="query" name="query" placeholder="搜索知识点" />
        <button type="submit">搜索</button>
      </form>
      <section className="stack">
        {results.map((item) => (
          <article className="card stack" key={item.id}>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <Link to={`/concepts/${item.id}`}>查看详情</Link>
          </article>
        ))}
      </section>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../shared/api/api-client";

export function LibraryPage({
  concepts: initialConcepts,
}: {
  concepts?: Array<{ id: string; title: string; summary: string }>;
}) {
  const [concepts, setConcepts] = useState(initialConcepts ?? []);

  useEffect(() => {
    if (initialConcepts) {
      return;
    }
    void apiClient.listConcepts().then(setConcepts);
  }, [initialConcepts]);

  return (
    <main className="page stack">
      <h1>知识库</h1>
      {concepts.map((concept) => (
        <article className="card stack" key={concept.id}>
          <h2>{concept.title}</h2>
          <p>{concept.summary}</p>
          <Link to={`/concepts/${concept.id}`}>查看详情</Link>
        </article>
      ))}
    </main>
  );
}

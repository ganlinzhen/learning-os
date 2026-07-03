import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../../shared/api/api-client";

export function ConceptDetailPage() {
  const { conceptId = "" } = useParams();
  const [concept, setConcept] = useState<any>();

  useEffect(() => {
    void apiClient.getConceptDetail(conceptId).then(setConcept);
  }, [conceptId]);

  if (!concept) {
    return <main className="page">加载知识点详情中...</main>;
  }

  return (
    <main className="page stack">
      <h1>{concept.title}</h1>
      <p>{concept.summary}</p>
      {concept.reviewCards?.length ? (
        <section className="stack">
          <h2>关联卡片</h2>
          {concept.reviewCards.map((card: any) => (
            <article className="card stack" key={card.id}>
              <strong>{card.question}</strong>
              <p>{card.answer}</p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

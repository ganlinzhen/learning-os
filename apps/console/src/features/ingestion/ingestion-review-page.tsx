import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { IngestionDetailDto } from "@learning-os/contracts";
import { apiClient } from "../../shared/api/api-client";

export function IngestionReviewPage({ data: initialData }: { data?: IngestionDetailDto }) {
  const { sessionId = initialData?.sessionId ?? "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<IngestionDetailDto | undefined>(initialData);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);

  useEffect(() => {
    if (initialData || !sessionId) {
      return;
    }

    void apiClient.getIngestionDetail(sessionId).then((payload) => {
      setData(payload);
      setSelectedCandidateIds([
        ...payload.coreConcepts.filter((item) => item.isSelected).map((item) => item.id),
        ...payload.candidateConcepts.filter((item) => item.isSelected).map((item) => item.id),
      ]);
    });
  }, [initialData, sessionId]);

  useEffect(() => {
    if (!initialData || selectedCandidateIds.length > 0) {
      return;
    }
    setSelectedCandidateIds([
      ...initialData.coreConcepts.filter((item) => item.isSelected).map((item) => item.id),
      ...initialData.candidateConcepts.filter((item) => item.isSelected).map((item) => item.id),
    ]);
  }, [initialData, selectedCandidateIds.length]);

  const grouped = useMemo(() => {
    if (!data) {
      return { core: [], candidate: [] };
    }
    return {
      core: data.coreConcepts,
      candidate: data.candidateConcepts,
    };
  }, [data]);

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId) ? current.filter((item) => item !== candidateId) : [...current, candidateId],
    );
  };

  const confirm = async () => {
    if (!data) {
      return;
    }
    await apiClient.confirmIngestion(data.sessionId, {
      selectedCandidateIds,
    });
    navigate("/library");
  };

  if (!data) {
    return <main className="page">加载整理结果中...</main>;
  }

  const renderConcept = (item: IngestionDetailDto["coreConcepts"][number]) => (
    <article className="card stack" key={item.id}>
      <label className="checkbox">
        <input checked={selectedCandidateIds.includes(item.id)} onChange={() => toggleCandidate(item.id)} type="checkbox" />
        <span>{item.title}</span>
      </label>
      <p>{item.summary}</p>
      {item.evidence ? <blockquote>{item.evidence}</blockquote> : null}
      {item.cards.length > 0 ? (
        <ul className="stack compact">
          {item.cards.map((card) => (
            <li key={card.id}>
              <strong>{card.question}</strong>
              <p>{card.answer}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );

  return (
    <main className="page stack">
      <header>
        <h1>{data.title}</h1>
        <p>先确认哪些候选知识点值得正式入库。</p>
      </header>
      <section className="stack">
        <h2>核心知识点</h2>
        {grouped.core.map(renderConcept)}
      </section>
      <section className="stack">
        <h2>候选知识点</h2>
        {grouped.candidate.length > 0 ? grouped.candidate.map(renderConcept) : <p>当前没有额外候选项。</p>}
      </section>
      <button onClick={() => void confirm()} type="button">
        确认入库
      </button>
    </main>
  );
}

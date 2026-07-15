import type { IngestionDetailDto } from "@learning-os/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../shared/api/api-client";

const selectedIdsFrom = (data?: IngestionDetailDto) =>
  data
    ? [...data.coreConcepts, ...data.candidateConcepts].filter((item) => item.isSelected).map((item) => item.id)
    : [];

export function IngestionReviewPage({ data: initialData }: { data?: IngestionDetailDto }) {
  const { sessionId: routeSessionId } = useParams();
  const sessionId = routeSessionId ?? initialData?.sessionId ?? "";
  const navigate = useNavigate();
  const [data, setData] = useState<IngestionDetailDto | undefined>(initialData);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(() => selectedIdsFrom(initialData));
  const [loadError, setLoadError] = useState("");
  const [pollGeneration, setPollGeneration] = useState(0);
  const [retryError, setRetryError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const actionLifecycleRef = useRef({ generation: 0, mounted: true, sessionId });

  if (actionLifecycleRef.current.sessionId !== sessionId) {
    actionLifecycleRef.current = {
      generation: actionLifecycleRef.current.generation + 1,
      mounted: true,
      sessionId,
    };
  }

  useEffect(() => {
    actionLifecycleRef.current.mounted = true;
    return () => {
      actionLifecycleRef.current = {
        ...actionLifecycleRef.current,
        generation: actionLifecycleRef.current.generation + 1,
        mounted: false,
      };
    };
  }, []);

  useEffect(() => {
    setRetrying(false);
    setConfirming(false);
    setRetryError("");
    setConfirmError("");
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    setLoadError("");
    setRetryError("");

    if (initialData?.sessionId === sessionId) {
      setData(initialData);
      setSelectedCandidateIds(selectedIdsFrom(initialData));
      return () => {
        active = false;
      };
    }

    setData(undefined);
    setSelectedCandidateIds([]);
    if (!sessionId) {
      return () => {
        active = false;
      };
    }

    void apiClient
      .getIngestionDetail(sessionId)
      .then((payload) => {
        if (!active) {
          return;
        }
        setData(payload);
        setSelectedCandidateIds(selectedIdsFrom(payload));
      })
      .catch(() => {
        if (active) {
          setLoadError("加载导入状态失败，请刷新页面后重试。");
        }
      });

    return () => {
      active = false;
    };
  }, [initialData, sessionId]);

  useEffect(() => {
    if (!sessionId || data?.status !== "processing") {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      timer = setTimeout(() => {
        void apiClient
          .getIngestionDetail(sessionId)
          .then((payload) => {
            if (!active) {
              return;
            }
            setLoadError("");
            setData(payload);
            setSelectedCandidateIds(selectedIdsFrom(payload));
            if (payload.status === "processing") {
              scheduleNext();
            }
          })
          .catch(() => {
            if (!active) {
              return;
            }
            setLoadError("状态更新失败，请点击重新加载。");
          });
      }, 1_000);
    };

    scheduleNext();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [data?.status, pollGeneration, sessionId]);

  const grouped = useMemo(
    () => ({
      core: data?.coreConcepts ?? [],
      candidate: data?.candidateConcepts ?? [],
    }),
    [data],
  );

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId) ? current.filter((item) => item !== candidateId) : [...current, candidateId],
    );
  };

  const captureActionLifecycle = () => {
    const actionSessionId = sessionId;
    const actionGeneration = actionLifecycleRef.current.generation;
    return {
      sessionId: actionSessionId,
      isCurrent: () => {
        const lifecycle = actionLifecycleRef.current;
        return (
          lifecycle.mounted &&
          lifecycle.sessionId === actionSessionId &&
          lifecycle.generation === actionGeneration
        );
      },
    };
  };

  const reload = async () => {
    if (!sessionId) {
      return;
    }
    const action = captureActionLifecycle();
    setLoadError("");
    try {
      const payload = await apiClient.getIngestionDetail(action.sessionId);
      if (!action.isCurrent()) {
        return;
      }
      setData(payload);
      setSelectedCandidateIds(selectedIdsFrom(payload));
      if (payload.status === "processing") {
        setPollGeneration((current) => current + 1);
      }
    } catch {
      if (action.isCurrent()) {
        setLoadError("状态更新失败，请点击重新加载。");
      }
    }
  };

  const confirm = async () => {
    if (!data || data.sessionId !== sessionId || confirming) {
      return;
    }

    const action = captureActionLifecycle();

    setConfirming(true);
    setConfirmError("");
    try {
      const selectedCardIds = [...data.coreConcepts, ...data.candidateConcepts]
        .filter((candidate) => selectedCandidateIds.includes(candidate.id))
        .flatMap((candidate) => candidate.cards.filter((card) => card.isSelected).map((card) => card.id));
      await apiClient.confirmIngestion(action.sessionId, { selectedCandidateIds, selectedCardIds });
      if (action.isCurrent()) {
        navigate("/library");
      }
    } catch {
      if (action.isCurrent()) {
        setConfirmError("入库失败，请稍后重试。");
      }
    } finally {
      if (action.isCurrent()) {
        setConfirming(false);
      }
    }
  };

  const retry = async () => {
    if (!data || data.sessionId !== sessionId || retrying || !data.task.canRetry) {
      return;
    }

    const action = captureActionLifecycle();

    setRetrying(true);
    setRetryError("");
    try {
      await apiClient.retryIngestion(action.sessionId);
      if (action.isCurrent()) {
        setData((current) =>
          current?.sessionId === action.sessionId
            ? {
                ...current,
                status: "processing",
                task: { ...current.task, status: "running", canRetry: false },
              }
            : current,
        );
      }
    } catch {
      if (action.isCurrent()) {
        setRetryError("重试失败，请稍后再试。");
      }
    } finally {
      if (action.isCurrent()) {
        setRetrying(false);
      }
    }
  };

  if (!data) {
    return (
      <main className="page stack">
        <p>{loadError ? "未能加载导入状态。" : "加载导入状态中…"}</p>
        {loadError ? <p role="alert">{loadError}</p> : null}
      </main>
    );
  }

  if (data.status === "processing") {
    const pending = data.task.status === "pending";
    return (
      <main className="page stack">
        <header>
          <h1>{data.title}</h1>
        </header>
        <section className="card stack" aria-live="polite" role="status">
          <h2>{pending ? "等待整理" : "正在整理"}</h2>
          <p>{pending ? "导入已创建，正在等待整理任务开始…" : "正在整理导入内容，请稍候…"}</p>
          {loadError ? (
            <>
              <p role="alert">{loadError}</p>
              <button onClick={() => void reload()} type="button">重新加载</button>
            </>
          ) : null}
        </section>
      </main>
    );
  }

  if (data.status === "failed") {
    return (
      <main className="page stack">
        <header>
          <h1>{data.title}</h1>
          <p>本次导入未完成，你可以检查提示后重新尝试。</p>
        </header>
        <section className="card stack">
          <h2>导入失败</h2>
          <p role="alert">{retryError || data.task.lastErrorMessage || "导入失败，请重试。"}</p>
          <p>已尝试 {data.task.attemptCount} 次</p>
          <button disabled={!data.task.canRetry || retrying} onClick={() => void retry()} type="button">
            {retrying ? "正在重试…" : "重试"}
          </button>
        </section>
      </main>
    );
  }

  if (data.status === "imported") {
    return (
      <main className="page stack">
        <header>
          <h1>{data.title}</h1>
        </header>
        <section className="card stack" aria-live="polite">
          <h2>已入库</h2>
          <p>知识点与复习卡片已经加入知识库。</p>
          <Link to="/library">前往知识库</Link>
        </section>
      </main>
    );
  }

  if (data.status !== "reviewable") {
    const message =
      data.status === "created"
        ? "导入已创建，正在等待整理任务开始…"
        : data.status === "confirmed"
          ? "审核结果已确认，正在完成入库…"
          : "本次导入已取消。";
    return (
      <main className="page stack">
        <h1>{data.title}</h1>
        <p role="status">{message}</p>
      </main>
    );
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
        <p>确认值得保留的知识点，再加入知识库。</p>
      </header>
      <section className="stack">
        <h2>核心知识点</h2>
        {grouped.core.map(renderConcept)}
      </section>
      <section className="stack">
        <h2>候选知识点</h2>
        {grouped.candidate.length > 0 ? grouped.candidate.map(renderConcept) : <p>当前没有额外候选项。</p>}
      </section>
      {confirmError ? <p role="alert">{confirmError}</p> : null}
      <button disabled={confirming} onClick={() => void confirm()} type="button">
        {confirming ? "正在入库…" : "确认入库"}
      </button>
    </main>
  );
}

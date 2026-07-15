import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppConfigService } from "../config/app-config.service";

type QueryRow = Record<string, unknown>;
type SqlValue = string | number | bigint | Uint8Array | null;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private db?: DatabaseSync;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    this.db?.close();
  }

  async enableShutdownHooks() {}

  readonly source = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into sources (
          id, type, title, url, local_path, content_hash, status, content, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.type,
        data.title,
        data.url ?? null,
        data.localPath,
        data.contentHash,
        data.status,
        data.content,
        now,
        now,
      );
      return this.mapSource(db.prepare("select * from sources where id = ?").get(id) as QueryRow);
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const db = await this.getDb();
      const current = db.prepare("select * from sources where id = ?").get(where.id) as QueryRow | undefined;
      if (!current) {
        throw new Error(`source_not_found:${where.id}`);
      }
      if (data.localPath !== undefined && (typeof data.localPath !== "string" || data.localPath.length === 0)) {
        throw new Error("source_local_path_required");
      }
      db.prepare(
        `update sources
         set type = ?, title = ?, url = ?, local_path = ?, content_hash = ?, status = ?, content = ?, updated_at = ?
         where id = ?`,
      ).run(
        data.type ?? String(current.type),
        data.title ?? String(current.title),
        data.url !== undefined ? data.url : this.nullableText(current.url),
        data.localPath !== undefined ? data.localPath : this.nullableText(current.local_path),
        data.contentHash ?? String(current.content_hash),
        data.status ?? String(current.status),
        data.content ?? String(current.content),
        new Date().toISOString(),
        where.id,
      );
      return this.mapSource(db.prepare("select * from sources where id = ?").get(where.id) as QueryRow);
    },
  };

  readonly ingestionSession = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into ingestion_sessions (
          id, source_id, latest_agent_task_id, status, domain_hint, created_at, updated_at, confirmed_at, imported_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.sourceId,
        data.latestAgentTaskId ?? null,
        data.status,
        data.domainHint ?? null,
        now,
        now,
        data.confirmedAt ? this.asIso(data.confirmedAt) : null,
        data.importedAt ? this.asIso(data.importedAt) : null,
      );
      return this.mapIngestionSession(db.prepare("select * from ingestion_sessions where id = ?").get(id) as QueryRow);
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const db = await this.getDb();
      const current = db.prepare("select * from ingestion_sessions where id = ?").get(where.id) as QueryRow | undefined;
      if (!current) {
        throw new Error(`ingestion_session_not_found:${where.id}`);
      }
      db.prepare(
        `update ingestion_sessions
         set source_id = ?, latest_agent_task_id = ?, status = ?, domain_hint = ?, confirmed_at = ?, imported_at = ?, updated_at = ?
         where id = ?`,
      ).run(
        data.sourceId ?? String(current.source_id),
        data.latestAgentTaskId ?? this.nullableText(current.latest_agent_task_id),
        data.status ?? String(current.status),
        data.domainHint ?? this.nullableText(current.domain_hint),
        data.confirmedAt ? this.asIso(data.confirmedAt) : this.nullableText(current.confirmed_at),
        data.importedAt ? this.asIso(data.importedAt) : this.nullableText(current.imported_at),
        new Date().toISOString(),
        where.id,
      );
      return this.mapIngestionSession(db.prepare("select * from ingestion_sessions where id = ?").get(where.id) as QueryRow);
    },
    findUnique: async ({ where, include }: { where: { id: string }; include?: any }) => {
      const db = await this.getDb();
      const row = db.prepare("select * from ingestion_sessions where id = ?").get(where.id) as QueryRow | undefined;
      if (!row) {
        return null;
      }
      const result: any = this.mapIngestionSession(row);
      if (include?.source) {
        const source = db.prepare("select * from sources where id = ?").get(String(row.source_id)) as QueryRow | undefined;
        result.source = source ? this.mapSource(source) : null;
      }
      if (include?.candidates) {
        const candidates = db
          .prepare("select * from concept_candidates where session_id = ? order by created_at asc")
          .all(where.id) as QueryRow[];
        result.candidates = candidates.map((candidate) => {
          const mapped: any = this.mapConceptCandidate(candidate);
          if (include.candidates.include?.cards) {
            mapped.cards = (db
              .prepare("select * from card_candidates where concept_candidate_id = ? order by created_at asc")
              .all(mapped.id) as QueryRow[]).map((card) => this.mapCardCandidate(card));
          }
          return mapped;
        });
      }
      return result;
    },
  };

  readonly conceptCandidate = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into concept_candidates (
          id, session_id, title, summary, evidence, is_core, is_selected, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.sessionId,
        data.title,
        data.summary,
        data.evidence ?? null,
        this.boolToInt(data.isCore),
        this.boolToInt(data.isSelected),
        now,
        now,
      );
      return this.mapConceptCandidate(
        db.prepare("select * from concept_candidates where id = ?").get(id) as QueryRow,
      );
    },
    findMany: async ({ where, include }: { where: { sessionId: string; id?: { in: string[] } }; include?: any }) => {
      const db = await this.getDb();
      const ids = where.id?.in ?? [];
      const rows =
        ids.length > 0
          ? (db
              .prepare(
                `select * from concept_candidates where session_id = ? and id in (${ids.map(() => "?").join(",")}) order by created_at asc`,
              )
              .all(where.sessionId, ...ids) as QueryRow[])
          : (db.prepare("select * from concept_candidates where session_id = ? order by created_at asc").all(where.sessionId) as QueryRow[]);
      return rows.map((candidate) => {
        const mapped: any = this.mapConceptCandidate(candidate);
        if (include?.cards) {
          mapped.cards = (db
            .prepare("select * from card_candidates where concept_candidate_id = ? order by created_at asc")
            .all(mapped.id) as QueryRow[]).map((card) => this.mapCardCandidate(card));
        }
        return mapped;
      });
    },
    deleteMany: async ({ where }: { where?: { sessionId?: string; id?: { in?: string[] } } } = {}) => {
      const db = await this.getDb();
      const conditions: string[] = [];
      const params: SqlValue[] = [];
      if (where?.sessionId) {
        conditions.push("session_id = ?");
        params.push(where.sessionId);
      }
      if (where?.id?.in) {
        if (where.id.in.length === 0) {
          return { count: 0 };
        }
        conditions.push(`id in (${where.id.in.map(() => "?").join(",")})`);
        params.push(...where.id.in);
      }
      const result = db.prepare(`delete from concept_candidates${conditions.length ? ` where ${conditions.join(" and ")}` : ""}`).run(...params);
      return { count: Number(result.changes) };
    },
  };

  readonly cardCandidate = {
    createMany: async ({ data }: { data: any[] }) => {
      const db = await this.getDb();
      const now = new Date().toISOString();
      const statement = db.prepare(
        `insert into card_candidates (
          id, session_id, concept_candidate_id, type, question, answer, explanation, is_selected, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of data) {
        statement.run(
          item.id ?? randomUUID(),
          item.sessionId,
          item.conceptCandidateId ?? null,
          item.type,
          item.question,
          item.answer,
          item.explanation ?? null,
          this.boolToInt(item.isSelected),
          now,
          now,
        );
      }
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where?: { sessionId?: string } } = {}) => {
      const db = await this.getDb();
      const result = where?.sessionId
        ? db.prepare("delete from card_candidates where session_id = ?").run(where.sessionId)
        : db.prepare("delete from card_candidates").run();
      return { count: Number(result.changes) };
    },
  };

  readonly concept = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into concepts (
          id, title, summary, explanation, evidence, status, mastery_score, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.title,
        data.summary,
        data.explanation ?? null,
        data.evidence ?? null,
        data.status,
        data.masteryScore ?? 0,
        now,
        now,
      );
      return this.mapConcept(db.prepare("select * from concepts where id = ?").get(id) as QueryRow);
    },
    findMany: async ({ orderBy, where }: { orderBy?: any; where?: any } = {}) => {
      const db = await this.getDb();
      const params: SqlValue[] = [];
      const conditions: string[] = [];
      if (where?.OR?.length) {
        const orConditions: string[] = [];
        for (const item of where.OR) {
          if (item.title?.contains) {
            orConditions.push("lower(title) like lower(?)");
            params.push(`%${String(item.title.contains)}%`);
          }
          if (item.summary?.contains) {
            orConditions.push("lower(summary) like lower(?)");
            params.push(`%${String(item.summary.contains)}%`);
          }
        }
        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(" or ")})`);
        }
      }
      let sql = "select * from concepts";
      if (conditions.length > 0) {
        sql += ` where ${conditions.join(" and ")}`;
      }
      if (orderBy?.createdAt) {
        sql += ` order by created_at ${String(orderBy.createdAt).toUpperCase()}`;
      } else if (orderBy?.updatedAt) {
        sql += ` order by updated_at ${String(orderBy.updatedAt).toUpperCase()}`;
      } else {
        sql += " order by created_at desc";
      }
      return (db.prepare(sql).all(...params) as QueryRow[]).map((row) => this.mapConcept(row));
    },
    findUnique: async ({ where, include }: { where: { id: string }; include?: any }) => {
      const db = await this.getDb();
      const row = db.prepare("select * from concepts where id = ?").get(where.id) as QueryRow | undefined;
      if (!row) {
        return null;
      }
      const result: any = this.mapConcept(row);
      if (include?.notes) {
        result.notes = (db.prepare("select * from notes where concept_id = ? order by created_at asc").all(where.id) as QueryRow[]).map((note) =>
          this.mapNote(note),
        );
      }
      if (include?.reviewCards) {
        result.reviewCards = (db.prepare("select * from review_cards where concept_id = ? order by created_at asc").all(where.id) as QueryRow[]).map((card) =>
          this.mapReviewCard(card),
        );
      }
      return result;
    },
  };

  readonly reviewCard = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into review_cards (
          id, concept_id, type, question, answer, explanation, due_at, stability, difficulty_fsrs, elapsed_days, scheduled_days, reps, lapses, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.conceptId,
        data.type,
        data.question,
        data.answer,
        data.explanation ?? null,
        this.asIso(data.dueAt),
        data.stability ?? 0,
        data.difficultyFsrs ?? 0,
        data.elapsedDays ?? 0,
        data.scheduledDays ?? 0,
        data.reps ?? 0,
        data.lapses ?? 0,
        now,
        now,
      );
      return this.mapReviewCard(db.prepare("select * from review_cards where id = ?").get(id) as QueryRow);
    },
    findMany: async ({ where, orderBy, include }: { where?: any; orderBy?: any; include?: any }) => {
      const db = await this.getDb();
      const params: SqlValue[] = [];
      const conditions: string[] = [];
      if (where?.dueAt?.lte) {
        conditions.push("due_at <= ?");
        params.push(this.asIso(where.dueAt.lte));
      }
      let sql = "select * from review_cards";
      if (conditions.length > 0) {
        sql += ` where ${conditions.join(" and ")}`;
      }
      if (orderBy?.dueAt) {
        sql += ` order by due_at ${String(orderBy.dueAt).toUpperCase()}`;
      } else {
        sql += " order by due_at asc";
      }
      return (db.prepare(sql).all(...params) as QueryRow[]).map((row) => {
        const mapped: any = this.mapReviewCard(row);
        if (include?.concept) {
          const concept = db.prepare("select * from concepts where id = ?").get(mapped.conceptId) as QueryRow | undefined;
          mapped.concept = concept ? this.mapConcept(concept) : null;
        }
        return mapped;
      });
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const db = await this.getDb();
      const row = db.prepare("select * from review_cards where id = ?").get(where.id) as QueryRow | undefined;
      return row ? this.mapReviewCard(row) : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const db = await this.getDb();
      const current = db.prepare("select * from review_cards where id = ?").get(where.id) as QueryRow | undefined;
      if (!current) {
        throw new Error(`review_card_not_found:${where.id}`);
      }
      db.prepare(
        `update review_cards
         set due_at = ?, stability = ?, difficulty_fsrs = ?, elapsed_days = ?, scheduled_days = ?, reps = ?, lapses = ?, updated_at = ?
         where id = ?`,
      ).run(
        data.dueAt ? this.asIso(data.dueAt) : String(current.due_at),
        data.stability ?? Number(current.stability),
        data.difficultyFsrs ?? Number(current.difficulty_fsrs),
        data.elapsedDays ?? Number(current.elapsed_days),
        data.scheduledDays ?? Number(current.scheduled_days),
        data.reps ?? Number(current.reps),
        data.lapses ?? Number(current.lapses),
        new Date().toISOString(),
        where.id,
      );
      return this.mapReviewCard(db.prepare("select * from review_cards where id = ?").get(where.id) as QueryRow);
    },
  };

  readonly reviewLog = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into review_logs (
          id, card_id, concept_id, rating, reviewed_at, next_due_at, time_spent_seconds, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.cardId,
        data.conceptId,
        data.rating,
        this.asIso(data.reviewedAt),
        this.asIso(data.nextDueAt),
        data.timeSpentSeconds ?? 0,
        now,
      );
      return {
        id,
        cardId: data.cardId,
        conceptId: data.conceptId,
        rating: data.rating,
        reviewedAt: this.asIso(data.reviewedAt),
        nextDueAt: this.asIso(data.nextDueAt),
        timeSpentSeconds: data.timeSpentSeconds ?? 0,
        createdAt: now,
      };
    },
  };

  readonly agentTask = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into agent_tasks (
          id, session_id, type, status, attempt_count, last_error_code, last_error_message, started_at, finished_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.sessionId ?? null,
        data.type ?? "ingestion",
        data.status,
        data.attemptCount ?? 0,
        data.lastErrorCode ?? null,
        data.lastErrorMessage ?? null,
        data.startedAt ? this.asIso(data.startedAt) : null,
        data.finishedAt ? this.asIso(data.finishedAt) : null,
        now,
        now,
      );
      return this.mapAgentTask(db.prepare("select * from agent_tasks where id = ?").get(id) as QueryRow);
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const db = await this.getDb();
      const current = db.prepare("select * from agent_tasks where id = ?").get(where.id) as QueryRow | undefined;
      if (!current) {
        throw new Error(`agent_task_not_found:${where.id}`);
      }
      db.prepare(
        `update agent_tasks
         set session_id = ?, type = ?, status = ?, attempt_count = ?, last_error_code = ?, last_error_message = ?, started_at = ?, finished_at = ?, updated_at = ?
         where id = ?`,
      ).run(
        data.sessionId !== undefined ? data.sessionId : this.nullableText(current.session_id),
        data.type ?? String(current.type),
        data.status ?? String(current.status),
        data.attemptCount ?? Number(current.attempt_count),
        data.lastErrorCode !== undefined ? data.lastErrorCode : this.nullableText(current.last_error_code),
        data.lastErrorMessage !== undefined ? data.lastErrorMessage : this.nullableText(current.last_error_message),
        data.startedAt !== undefined ? (data.startedAt ? this.asIso(data.startedAt) : null) : this.nullableText(current.started_at),
        data.finishedAt !== undefined ? (data.finishedAt ? this.asIso(data.finishedAt) : null) : this.nullableText(current.finished_at),
        new Date().toISOString(),
        where.id,
      );
      return this.mapAgentTask(db.prepare("select * from agent_tasks where id = ?").get(where.id) as QueryRow);
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const db = await this.getDb();
      const row = db.prepare("select * from agent_tasks where id = ?").get(where.id) as QueryRow | undefined;
      return row ? this.mapAgentTask(row) : null;
    },
  };

  readonly note = {
    create: async ({ data }: { data: any }) => {
      const db = await this.getDb();
      const id = data.id ?? randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into notes (id, concept_id, title, content, local_path, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, data.conceptId, data.title, data.content, data.localPath ?? null, now, now);
      return this.mapNote(db.prepare("select * from notes where id = ?").get(id) as QueryRow);
    },
  };

  async claimPendingIngestionTask(taskId: string) {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const row = db
      .prepare(
        `update agent_tasks
         set status = 'running', started_at = ?, updated_at = ?
         where id = ? and status = 'pending'
         returning *`,
      )
      .get(now, now, taskId) as QueryRow | undefined;
    return row ? this.mapAgentTask(row) : null;
  }

  async claimReviewableIngestion(sessionId: string) {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const row = db
      .prepare(
        `update ingestion_sessions
         set status = 'confirmed', confirmed_at = ?, updated_at = ?
         where id = ? and status = 'reviewable'
         returning *`,
      )
      .get(now, now, sessionId) as QueryRow | undefined;
    return row ? this.mapIngestionSession(row) : null;
  }

  async claimFailedIngestionRetry(sessionId: string) {
    const db = await this.getDb();
    let transactionStarted = false;
    try {
      db.exec("begin immediate");
      transactionStarted = true;
      const task = db
        .prepare(
          `select task.*
           from ingestion_sessions session
           join agent_tasks task on task.id = session.latest_agent_task_id
           where session.id = ?
             and session.status = 'failed'
             and task.status = 'failed'`,
        )
        .get(sessionId) as QueryRow | undefined;
      if (!task) {
        db.exec("rollback");
        transactionStarted = false;
        return null;
      }

      const now = new Date().toISOString();
      const taskUpdate = db
        .prepare(
          `update agent_tasks
           set status = 'pending', attempt_count = attempt_count + 1,
               last_error_code = null, last_error_message = null,
               started_at = null, finished_at = null, updated_at = ?
           where id = ? and status = 'failed'`,
        )
        .run(now, String(task.id));
      const sessionUpdate = db
        .prepare(
          `update ingestion_sessions
           set status = 'processing', updated_at = ?
           where id = ? and status = 'failed' and latest_agent_task_id = ?`,
        )
        .run(now, sessionId, String(task.id));
      if (Number(taskUpdate.changes) !== 1 || Number(sessionUpdate.changes) !== 1) {
        db.exec("rollback");
        transactionStarted = false;
        return null;
      }

      const updatedTask = db.prepare("select * from agent_tasks where id = ?").get(String(task.id)) as QueryRow;
      db.exec("commit");
      transactionStarted = false;
      return this.mapAgentTask(updatedTask);
    } catch (error) {
      if (transactionStarted) {
        try {
          db.exec("rollback");
        } catch {
          // 保留原始事务异常。
        }
      }
      throw error;
    }
  }

  async transaction<T>(work: (prisma: this) => Promise<T> | T): Promise<T> {
    const transactionClient = new PrismaService(this.config);
    let transactionDb: DatabaseSync | undefined;
    try {
      await transactionClient.onModuleInit();
      transactionDb = await transactionClient.getDb();
      transactionDb.exec("begin immediate");
      const result = await work(transactionClient as this);
      transactionDb.exec("commit");
      return result;
    } catch (error) {
      try {
        transactionDb?.exec("rollback");
      } catch {
        // 保留原始回调异常。
      }
      throw error;
    } finally {
      await transactionClient.onModuleDestroy();
    }
  }

  private async initialize() {
    await mkdir(dirname(this.config.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.config.databasePath);
    this.db.exec(`
      pragma journal_mode = WAL;
      pragma foreign_keys = ON;

      create table if not exists sources (
        id text primary key,
        type text not null,
        title text not null,
        url text,
        local_path text not null,
        content_hash text not null,
        status text not null,
        content text not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists ingestion_sessions (
        id text primary key,
        source_id text not null references sources(id) on delete cascade,
        latest_agent_task_id text,
        status text not null,
        domain_hint text,
        created_at text not null,
        updated_at text not null,
        confirmed_at text,
        imported_at text
      );

      create table if not exists concept_candidates (
        id text primary key,
        session_id text not null references ingestion_sessions(id) on delete cascade,
        title text not null,
        summary text not null,
        evidence text,
        is_core integer not null,
        is_selected integer not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists card_candidates (
        id text primary key,
        session_id text not null references ingestion_sessions(id) on delete cascade,
        concept_candidate_id text references concept_candidates(id) on delete set null,
        type text not null,
        question text not null,
        answer text not null,
        explanation text,
        is_selected integer not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists concepts (
        id text primary key,
        title text not null,
        summary text not null,
        explanation text,
        evidence text,
        status text not null,
        mastery_score integer not null default 0,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists notes (
        id text primary key,
        concept_id text not null references concepts(id) on delete cascade,
        title text not null,
        content text not null,
        local_path text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists agent_tasks (
        id text primary key,
        session_id text,
        type text not null default 'ingestion',
        status text not null,
        attempt_count integer not null default 0,
        last_error_code text,
        last_error_message text,
        started_at text,
        finished_at text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists review_cards (
        id text primary key,
        concept_id text not null references concepts(id) on delete cascade,
        type text not null,
        question text not null,
        answer text not null,
        explanation text,
        due_at text not null,
        stability real not null default 0,
        difficulty_fsrs real not null default 0,
        elapsed_days integer not null default 0,
        scheduled_days integer not null default 0,
        reps integer not null default 0,
        lapses integer not null default 0,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists review_logs (
        id text primary key,
        card_id text not null references review_cards(id) on delete cascade,
        concept_id text not null references concepts(id) on delete cascade,
        rating text not null,
        reviewed_at text not null,
        next_due_at text not null,
        time_spent_seconds integer not null default 0,
        created_at text not null
      );
    `);
    const noteColumns = this.db.prepare("pragma table_info(notes)").all() as QueryRow[];
    if (!noteColumns.some((column) => String(column.name) === "local_path")) {
      this.db.exec("alter table notes add column local_path text");
    }
  }

  private async getDb() {
    if (!this.db) {
      await this.initialize();
    }
    return this.db as DatabaseSync;
  }

  private boolToInt(value: boolean) {
    return value ? 1 : 0;
  }

  private intToBool(value: unknown) {
    return Number(value) === 1;
  }

  private asIso(value: string | Date) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private nullableText(value: unknown): string | null {
    return value == null ? null : String(value);
  }

  private mapSource(row: QueryRow) {
    return {
      id: String(row.id),
      type: String(row.type),
      title: String(row.title),
      url: row.url ? String(row.url) : undefined,
      localPath: row.local_path == null ? undefined : String(row.local_path),
      contentHash: String(row.content_hash),
      status: String(row.status),
      content: String(row.content),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapIngestionSession(row: QueryRow) {
    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      latestAgentTaskId: row.latest_agent_task_id ? String(row.latest_agent_task_id) : undefined,
      status: String(row.status),
      domainHint: row.domain_hint ? String(row.domain_hint) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
      importedAt: row.imported_at ? String(row.imported_at) : undefined,
    };
  }

  private mapConceptCandidate(row: QueryRow) {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      title: String(row.title),
      summary: String(row.summary),
      evidence: row.evidence ? String(row.evidence) : "",
      isCore: this.intToBool(row.is_core),
      isSelected: this.intToBool(row.is_selected),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapCardCandidate(row: QueryRow) {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      conceptCandidateId: row.concept_candidate_id ? String(row.concept_candidate_id) : undefined,
      type: String(row.type),
      question: String(row.question),
      answer: String(row.answer),
      explanation: row.explanation ? String(row.explanation) : "",
      isSelected: this.intToBool(row.is_selected),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapConcept(row: QueryRow) {
    return {
      id: String(row.id),
      title: String(row.title),
      summary: String(row.summary),
      explanation: row.explanation ? String(row.explanation) : undefined,
      evidence: row.evidence ? String(row.evidence) : undefined,
      status: String(row.status),
      masteryScore: Number(row.mastery_score),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapNote(row: QueryRow) {
    return {
      id: String(row.id),
      conceptId: String(row.concept_id),
      title: String(row.title),
      content: String(row.content),
      localPath: row.local_path ? String(row.local_path) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAgentTask(row: QueryRow) {
    return {
      id: String(row.id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      type: String(row.type),
      status: String(row.status),
      attemptCount: Number(row.attempt_count),
      lastErrorCode: row.last_error_code ? String(row.last_error_code) : undefined,
      lastErrorMessage: row.last_error_message ? String(row.last_error_message) : undefined,
      startedAt: row.started_at ? String(row.started_at) : undefined,
      finishedAt: row.finished_at ? String(row.finished_at) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapReviewCard(row: QueryRow) {
    return {
      id: String(row.id),
      conceptId: String(row.concept_id),
      type: String(row.type),
      question: String(row.question),
      answer: String(row.answer),
      explanation: row.explanation ? String(row.explanation) : "",
      dueAt: new Date(String(row.due_at)),
      stability: Number(row.stability),
      difficultyFsrs: Number(row.difficulty_fsrs),
      elapsedDays: Number(row.elapsed_days),
      scheduledDays: Number(row.scheduled_days),
      reps: Number(row.reps),
      lapses: Number(row.lapses),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
const app_config_service_1 = require("../config/app-config.service");
let PrismaService = class PrismaService {
    config;
    db;
    constructor(config) {
        this.config = config;
    }
    async onModuleInit() {
        await this.initialize();
    }
    async onModuleDestroy() {
        this.db?.close();
    }
    async enableShutdownHooks() { }
    source = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into sources (
          id, type, title, url, local_path, content_hash, status, content, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.type, data.title, data.url ?? null, data.localPath, data.contentHash, data.status, data.content, now, now);
            return this.mapSource(db.prepare("select * from sources where id = ?").get(id));
        },
    };
    ingestionSession = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into ingestion_sessions (
          id, source_id, latest_agent_task_id, status, domain_hint, created_at, updated_at, confirmed_at, imported_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.sourceId, data.latestAgentTaskId ?? null, data.status, data.domainHint ?? null, now, now, data.confirmedAt ? this.asIso(data.confirmedAt) : null, data.importedAt ? this.asIso(data.importedAt) : null);
            return this.mapIngestionSession(db.prepare("select * from ingestion_sessions where id = ?").get(id));
        },
        update: async ({ where, data }) => {
            const db = await this.getDb();
            const current = db.prepare("select * from ingestion_sessions where id = ?").get(where.id);
            if (!current) {
                throw new Error(`ingestion_session_not_found:${where.id}`);
            }
            db.prepare(`update ingestion_sessions
         set source_id = ?, latest_agent_task_id = ?, status = ?, domain_hint = ?, confirmed_at = ?, imported_at = ?, updated_at = ?
         where id = ?`).run(data.sourceId ?? String(current.source_id), data.latestAgentTaskId ?? this.nullableText(current.latest_agent_task_id), data.status ?? String(current.status), data.domainHint ?? this.nullableText(current.domain_hint), data.confirmedAt ? this.asIso(data.confirmedAt) : this.nullableText(current.confirmed_at), data.importedAt ? this.asIso(data.importedAt) : this.nullableText(current.imported_at), new Date().toISOString(), where.id);
            return this.mapIngestionSession(db.prepare("select * from ingestion_sessions where id = ?").get(where.id));
        },
        findUnique: async ({ where, include }) => {
            const db = await this.getDb();
            const row = db.prepare("select * from ingestion_sessions where id = ?").get(where.id);
            if (!row) {
                return null;
            }
            const result = this.mapIngestionSession(row);
            if (include?.source) {
                const source = db.prepare("select * from sources where id = ?").get(String(row.source_id));
                result.source = source ? this.mapSource(source) : null;
            }
            if (include?.candidates) {
                const candidates = db
                    .prepare("select * from concept_candidates where session_id = ? order by created_at asc")
                    .all(where.id);
                result.candidates = candidates.map((candidate) => {
                    const mapped = this.mapConceptCandidate(candidate);
                    if (include.candidates.include?.cards) {
                        mapped.cards = db
                            .prepare("select * from card_candidates where concept_candidate_id = ? order by created_at asc")
                            .all(mapped.id).map((card) => this.mapCardCandidate(card));
                    }
                    return mapped;
                });
            }
            return result;
        },
    };
    conceptCandidate = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into concept_candidates (
          id, session_id, title, summary, evidence, is_core, is_selected, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.sessionId, data.title, data.summary, data.evidence ?? null, this.boolToInt(data.isCore), this.boolToInt(data.isSelected), now, now);
            return this.mapConceptCandidate(db.prepare("select * from concept_candidates where id = ?").get(id));
        },
        findMany: async ({ where, include }) => {
            const db = await this.getDb();
            const ids = where.id?.in ?? [];
            const rows = ids.length > 0
                ? db
                    .prepare(`select * from concept_candidates where session_id = ? and id in (${ids.map(() => "?").join(",")}) order by created_at asc`)
                    .all(where.sessionId, ...ids)
                : db.prepare("select * from concept_candidates where session_id = ? order by created_at asc").all(where.sessionId);
            return rows.map((candidate) => {
                const mapped = this.mapConceptCandidate(candidate);
                if (include?.cards) {
                    mapped.cards = db
                        .prepare("select * from card_candidates where concept_candidate_id = ? order by created_at asc")
                        .all(mapped.id).map((card) => this.mapCardCandidate(card));
                }
                return mapped;
            });
        },
    };
    cardCandidate = {
        createMany: async ({ data }) => {
            const db = await this.getDb();
            const now = new Date().toISOString();
            const statement = db.prepare(`insert into card_candidates (
          id, session_id, concept_candidate_id, type, question, answer, explanation, is_selected, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const item of data) {
                statement.run((0, node_crypto_1.randomUUID)(), item.sessionId, item.conceptCandidateId ?? null, item.type, item.question, item.answer, item.explanation ?? null, this.boolToInt(item.isSelected), now, now);
            }
            return { count: data.length };
        },
    };
    concept = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into concepts (
          id, title, summary, explanation, evidence, status, mastery_score, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.title, data.summary, data.explanation ?? null, data.evidence ?? null, data.status, data.masteryScore ?? 0, now, now);
            return this.mapConcept(db.prepare("select * from concepts where id = ?").get(id));
        },
        findMany: async ({ orderBy, where } = {}) => {
            const db = await this.getDb();
            const params = [];
            const conditions = [];
            if (where?.OR?.length) {
                const orConditions = [];
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
            }
            else if (orderBy?.updatedAt) {
                sql += ` order by updated_at ${String(orderBy.updatedAt).toUpperCase()}`;
            }
            else {
                sql += " order by created_at desc";
            }
            return db.prepare(sql).all(...params).map((row) => this.mapConcept(row));
        },
        findUnique: async ({ where, include }) => {
            const db = await this.getDb();
            const row = db.prepare("select * from concepts where id = ?").get(where.id);
            if (!row) {
                return null;
            }
            const result = this.mapConcept(row);
            if (include?.notes) {
                result.notes = db.prepare("select * from notes where concept_id = ? order by created_at asc").all(where.id).map((note) => this.mapNote(note));
            }
            if (include?.reviewCards) {
                result.reviewCards = db.prepare("select * from review_cards where concept_id = ? order by created_at asc").all(where.id).map((card) => this.mapReviewCard(card));
            }
            return result;
        },
    };
    reviewCard = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into review_cards (
          id, concept_id, type, question, answer, explanation, due_at, stability, difficulty_fsrs, elapsed_days, scheduled_days, reps, lapses, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.conceptId, data.type, data.question, data.answer, data.explanation ?? null, this.asIso(data.dueAt), data.stability ?? 0, data.difficultyFsrs ?? 0, data.elapsedDays ?? 0, data.scheduledDays ?? 0, data.reps ?? 0, data.lapses ?? 0, now, now);
            return this.mapReviewCard(db.prepare("select * from review_cards where id = ?").get(id));
        },
        findMany: async ({ where, orderBy, include }) => {
            const db = await this.getDb();
            const params = [];
            const conditions = [];
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
            }
            else {
                sql += " order by due_at asc";
            }
            return db.prepare(sql).all(...params).map((row) => {
                const mapped = this.mapReviewCard(row);
                if (include?.concept) {
                    const concept = db.prepare("select * from concepts where id = ?").get(mapped.conceptId);
                    mapped.concept = concept ? this.mapConcept(concept) : null;
                }
                return mapped;
            });
        },
        findUnique: async ({ where }) => {
            const db = await this.getDb();
            const row = db.prepare("select * from review_cards where id = ?").get(where.id);
            return row ? this.mapReviewCard(row) : null;
        },
        update: async ({ where, data }) => {
            const db = await this.getDb();
            const current = db.prepare("select * from review_cards where id = ?").get(where.id);
            if (!current) {
                throw new Error(`review_card_not_found:${where.id}`);
            }
            db.prepare(`update review_cards
         set due_at = ?, stability = ?, difficulty_fsrs = ?, elapsed_days = ?, scheduled_days = ?, reps = ?, lapses = ?, updated_at = ?
         where id = ?`).run(data.dueAt ? this.asIso(data.dueAt) : String(current.due_at), data.stability ?? Number(current.stability), data.difficultyFsrs ?? Number(current.difficulty_fsrs), data.elapsedDays ?? Number(current.elapsed_days), data.scheduledDays ?? Number(current.scheduled_days), data.reps ?? Number(current.reps), data.lapses ?? Number(current.lapses), new Date().toISOString(), where.id);
            return this.mapReviewCard(db.prepare("select * from review_cards where id = ?").get(where.id));
        },
    };
    reviewLog = {
        create: async ({ data }) => {
            const db = await this.getDb();
            const id = (0, node_crypto_1.randomUUID)();
            const now = new Date().toISOString();
            db.prepare(`insert into review_logs (
          id, card_id, concept_id, rating, reviewed_at, next_due_at, time_spent_seconds, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.cardId, data.conceptId, data.rating, this.asIso(data.reviewedAt), this.asIso(data.nextDueAt), data.timeSpentSeconds ?? 0, now);
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
    async initialize() {
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(this.config.databasePath), { recursive: true });
        this.db = new node_sqlite_1.DatabaseSync(this.config.databasePath);
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
    }
    async getDb() {
        if (!this.db) {
            await this.initialize();
        }
        return this.db;
    }
    boolToInt(value) {
        return value ? 1 : 0;
    }
    intToBool(value) {
        return Number(value) === 1;
    }
    asIso(value) {
        return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    }
    nullableText(value) {
        return value == null ? null : String(value);
    }
    mapSource(row) {
        return {
            id: String(row.id),
            type: String(row.type),
            title: String(row.title),
            url: row.url ? String(row.url) : undefined,
            localPath: String(row.local_path),
            contentHash: String(row.content_hash),
            status: String(row.status),
            content: String(row.content),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
        };
    }
    mapIngestionSession(row) {
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
    mapConceptCandidate(row) {
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
    mapCardCandidate(row) {
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
    mapConcept(row) {
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
    mapNote(row) {
        return {
            id: String(row.id),
            conceptId: String(row.concept_id),
            title: String(row.title),
            content: String(row.content),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
        };
    }
    mapReviewCard(row) {
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
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService])
], PrismaService);

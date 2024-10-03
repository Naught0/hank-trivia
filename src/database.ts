import type { hank } from "@hank.chat/pdk";
import { PreparedStatement } from "@hank.chat/types";
import { validTimeout } from "./validate";

type Hank = typeof hank;

export class Database {
  protected hank: Hank;

  constructor(hank: Hank) {
    this.hank = hank;
  }

  public async createTables() {
    const createGameTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_game (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, is_active INTEGER, created_at timestamp DEFAULT current_timestamp)",
    });
    // Rows are deleted after game is finished
    const createGameStateTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_game_state (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, api_response TEXT, question_index INTEGER, question_total INTEGER)",
    });
    const createScoresTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_score (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_user_id TEXT, game_id INTEGER, created_at timestamp DEFAULT current_timestamp)",
    });
    const createConfigTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_config (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, key TEXT, value TEXT, UNIQUE (channel_id, key))",
    });
    for (const preparedStatement of [
      createGameTable,
      createGameStateTable,
      createScoresTable,
      createConfigTable,
    ]) {
      await this.hank.dbQuery(preparedStatement);
    }
  }

  public async createGame(channel_id: string) {
    const stmt = PreparedStatement.create({
      sql: "INSERT INTO trivia_game (channel_id, is_active) VALUES (?, 1) RETURNING *",
      values: [channel_id],
    });
    return (await this.hank.dbQuery<Game>(stmt))[0];
  }

  public async getConfig(channel_id: string) {
    const stmt = PreparedStatement.create({
      sql: "SELECT key, value FROM trivia_config WHERE channel_id = ?",
      values: [channel_id],
    });
    const result = await this.hank.dbQuery<{ key: string; value: string }>(
      stmt,
    );
    if (result.length === 0) return null;

    return result.reduce(
      (acc, cur) => {
        acc[cur.key as TriviaConfigKey] = cur.value;
        return acc;
      },
      {} as Record<TriviaConfigKey, string>,
    );
  }

  public async setRoundTimeout(channel_id: string, timeout: number) {
    if (!validTimeout(timeout))
      throw new Error("Timeout must be between 0 and 60 seconds");

    const stmt = PreparedStatement.create({
      sql: `REPLACE INTO trivia_config (key, value, channel_id) VALUES ("${TriviaConfigKey.RoundTimeout}", ?, ?)`,
      values: [timeout.toString(), channel_id],
    });
    await this.hank.dbQuery(stmt);
  }

  public async setDefaultQuestionCount(channel_id: string, count: number) {
    if (count < 1 || count > 20)
      throw new Error("Number of questions must be between 1 and 20");

    const stmt = PreparedStatement.create({
      sql: `REPLACE INTO trivia_config (key, value, channel_id) VALUES ("${TriviaConfigKey.QuestionTotal}", ?, ?)`,
      values: [count.toString(), channel_id],
    });
    await this.hank.dbQuery(stmt);
  }

  public async getActiveGame(channel_id: string) {
    const preparedStatement = PreparedStatement.create({
      sql: "SELECT * FROM trivia_game WHERE channel_id = ? AND is_active = 1",
      values: [channel_id],
    });
    const games = await this.hank.dbQuery<DBGame>(preparedStatement);
    if (!games.length) return null;

    return games[0];
  }

  public async stopGame(game_id: number) {
    const deactivate = PreparedStatement.create({
      sql: "UPDATE trivia_game SET is_active = 0 WHERE id = ?",
      values: [game_id.toString()],
    });
    const deleteGameState = PreparedStatement.create({
      sql: "DELETE FROM trivia_game_state WHERE game_id = ?",
      values: [game_id.toString()],
    });

    const statements = [deactivate, deleteGameState];
    for (const stmt of statements) {
      await this.hank.dbQuery(stmt);
    }
  }

  public async initGameState(state: Omit<GameState, "id">) {
    const stmt = PreparedStatement.create({
      sql: "INSERT INTO trivia_game_state (game_id, api_response, question_index, question_total) VALUES (?, ?, ?, ?) RETURNING *",
      values: [
        state.game_id.toString(),
        state.api_response,
        state.question_index.toString(),
        state.question_total.toString(),
      ],
    });
    const resp = await this.hank.dbQuery<GameState>(stmt);

    return resp[0];
  }

  public async updateQuestionIndex(gameId: number, questionIdx: number) {
    const stmt = PreparedStatement.create({
      sql: "UPDATE trivia_game_state SET question_index = ? WHERE game_id = ? RETURNING *",
      values: [questionIdx.toString(), gameId.toString()],
    });
    const resp = await this.hank.dbQuery<GameState>(stmt);

    return resp[0];
  }

  public async getGameState(game_id: number) {
    const stmt = PreparedStatement.create({
      sql: "SELECT * FROM trivia_game_state WHERE game_id = ?",
      values: [game_id.toString()],
    });
    const resp = await this.hank.dbQuery<GameState>(stmt);
    return resp[0];
  }

  public async createScore(discord_user_id: string, gameId: number) {
    const stmt = PreparedStatement.create({
      sql: "INSERT INTO trivia_score (discord_user_id, game_id) VALUES (?, ?) RETURNING *",
      values: [discord_user_id, gameId.toString()],
    });

    await this.hank.dbQuery<DBGameScore>(stmt);
  }

  public async getGameScores(gameId: number) {
    const stmt = PreparedStatement.create({
      sql: "SELECT discord_user_id, count(*) as count FROM trivia_score WHERE game_id = ? GROUP BY discord_user_id ORDER BY count DESC LIMIT 3",
      values: [gameId.toString()],
    });
    return await this.hank.dbQuery<UserScore>(stmt);
  }

  public async getScoreByUserId(userId: string) {
    const stmt = PreparedStatement.create({
      sql: "SELECT discord_user_id, count(*) as count FROM trivia_score WHERE discord_user_id = ? GROUP BY discord_user_id",
      values: [userId],
    });
    const res = await this.hank.dbQuery<UserScore | null>(stmt);

    return res[0];
  }

  public async getAllTimeScores() {
    const stmt = PreparedStatement.create({
      sql: "SELECT discord_user_id, count(*) AS count FROM trivia_score GROUP BY discord_user_id ORDER BY count DESC LIMIT 3",
      values: [],
    });
    return await this.hank.dbQuery<UserScore>(stmt);
  }
}

export enum TriviaConfigKey {
  RoundTimeout = "round_timeout",
  QuestionTotal = "question_total",
}

export interface Config {
  id: number;
  channel_id: string;
  key: TriviaConfigKey;
  value: string;
}

export interface Game {
  id: number;
  channel_id: string;
  is_active: boolean;
}

export interface DBGame extends Game {
  created_at: string;
}

export interface GameState {
  id: number;
  game_id: number;
  api_response: string;
  question_index: number;
  question_total: number;
}

export interface GameScore {
  id: number;
  discord_user_id: string;
  game_id: number;
}

export interface DBGameScore extends GameScore {
  created_at: string;
}

export interface UserScore {
  discord_user_id: string;
  count: number;
}

import { Hank } from "@hank.chat/pdk";
import { PreparedStatement, Results } from "@hank.chat/types";

export class Database {
  protected hank: Hank;

  constructor(hank: Hank) {
    this.hank = hank;
  }

  private queryResponseFromJson<T>(results: Results) {
    return results.rows.map((row) => JSON.parse(row) as T);
  }

  public async createTables() {
    const createGameTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_game (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, is_active INTEGER)",
    });
    // Rows are deleted after game is finished
    const createGameStateTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_game_state (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, api_response TEXT, question_index INTEGER, question_total INTEGER)",
    });
    const createScoresTable = PreparedStatement.create({
      sql: "CREATE TABLE IF NOT EXISTS trivia_score (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_user_id TEXT, game_id INTEGER)",
    });
    for (const preparedStatement of [
      createGameTable,
      createGameStateTable,
      createScoresTable,
    ]) {
      await this.hank.dbQuery(preparedStatement);
    }
  }

  public async createGame(channel_id: string) {
    const preparedStatement = PreparedStatement.create({
      sql: "INSERT INTO trivia_game (channel_id, is_active) VALUES (?, 1)",
      values: [channel_id],
    });
    const resp = await this.hank.dbQuery(preparedStatement);

    return this.queryResponseFromJson<Game>(resp)[0];
  }

  public async getCurrentGame(channel_id: string) {
    const preparedStatement = PreparedStatement.create({
      sql: "SELECT * FROM trivia_game WHERE channel_id = ?",
      values: [channel_id],
    });
    const resp = await this.hank.dbQuery(preparedStatement);
    const games = this.queryResponseFromJson<Game>(resp);
    if (!games.length) return null;

    return games[0];
  }

  public async stopGame(game_id: string) {
    const deactivate = PreparedStatement.create({
      sql: "UPDATE trivia_game SET is_active = 0 WHERE id = ?",
      values: [game_id],
    });
    const deleteGameState = PreparedStatement.create({
      sql: "DELETE FROM trivia_game_state WHERE game_id = ?",
      values: [game_id],
    });

    const statements = [deactivate, deleteGameState];
    for (const stmt of statements) {
      await this.hank.dbQuery(stmt);
    }
  }

  public async createGameState(state: Omit<GameState, "id">) {
    const stmt = PreparedStatement.create({
      sql: "INSERT OR REPLACE INTO trivia_game_state (game_id, api_response, question_index, question_total) VALUES (?, ?, ?, ?)",
      values: [
        state.game_id.toString(),
        state.api_response,
        state.question_index.toString(),
        state.question_total.toString(),
      ],
    });
    const resp = await this.hank.dbQuery(stmt);

    return this.queryResponseFromJson<GameState>(resp)[0];
  }

  public async updateQuestionIndex(game_id: number, question_index: number) {
    const preparedStatement = PreparedStatement.create({
      sql: "UPDATE trivia_game_state SET question_index = ? WHERE game_id = ?",
      values: [question_index.toString(), game_id.toString()],
    });
    const resp = await this.hank.dbQuery(preparedStatement);

    return this.queryResponseFromJson<GameState>(resp)[0];
  }

  public async getGameState(game_id: number) {
    const stmt = PreparedStatement.create({
      sql: "SELECT * FROM trivia_game_state WHERE game_id = ?",
      values: [game_id.toString()],
    });
    const resp = await this.hank.dbQuery(stmt);
    return this.queryResponseFromJson<GameState>(resp)[0];
  }

  public async createScore(discord_user_id: string, game_id: string) {
    const stmt = PreparedStatement.create({
      sql: "INSERT INTO trivia_score (discord_user_id, game_id) VALUES (?, ?)",
      values: [discord_user_id, game_id],
    });

    await this.hank.dbQuery(stmt);
  }
}

export interface Game {
  id: number;
  channel_id: string;
  is_active: boolean;
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

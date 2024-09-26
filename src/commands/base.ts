import { Database } from "../database";
import { ICommand, Context, HankPDK, CommandConstructor } from "../types";

export class Command implements ICommand {
  public commandNames: string[] = [];
  public help?: string | null;
  constructor(
    protected hank: HankPDK,
    protected db: Database,
  ) {}
  async execute(_: Context) {}
}

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): Command {
  return new command(hank, db);
}

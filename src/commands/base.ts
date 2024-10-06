import { Database } from "../database";
import { CommandConstructor, Context, HankPDK, ICommand } from "../types";
import { createHelpText } from "../util";

export class BaseCommand implements ICommand {
  public commandNames: string[] = [];
  public description = "";
  public args?: string[];
  constructor(
    protected hank: HankPDK,
    protected db: Database,
  ) {}
  get help() {
    return createHelpText(this.commandNames, this.description, this.args);
  }
  async execute(_: Context): Promise<void> {}
}

export function createCommand(
  command: CommandConstructor,
  hank: HankPDK,
  db: Database,
): BaseCommand {
  return new command(hank, db);
}

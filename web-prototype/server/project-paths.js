import { existsSync } from "node:fs";
import path from "node:path";

export function resolveProjectPaths(appRoot, {characterRoot = process.env.OPENSMASH_CHARACTER_ROOT} = {}) {
  if (characterRoot && !path.isAbsolute(characterRoot)) throw Error("OPENSMASH_CHARACTER_ROOT must be an absolute private asset path.");
  const pipelineProjectRoot = path.resolve(appRoot, "..");
  const localEngineRoot = path.join(pipelineProjectRoot, "BattleShip", "web-dist");
  const workspaceRoot = existsSync(localEngineRoot)
    ? pipelineProjectRoot
    : path.resolve(pipelineProjectRoot, "..");

  return {
    pipelineProjectRoot,
    engineRoot: path.join(workspaceRoot, "BattleShip", "web-dist"),
    pipelineUiRoot: characterRoot || path.join(pipelineProjectRoot, "play", "ui"),
  };
}

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDir, "..");
const distDir = join(projectRoot, "dist-prod");
const packageJsonPath = join(projectRoot, "package.json");

mkdirSync(distDir, { recursive: true });
copyFileSync(packageJsonPath, join(distDir, "package.source.json"));

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.type = "commonjs";
packageJson.scripts = {
  start: "node main.js",
};

writeFileSync(join(distDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

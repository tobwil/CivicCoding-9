import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(
  projectRoot,
  "node_modules",
  "liblouis-build",
  "build-no-tables-utf32.js",
);
const destinationDirectory = join(projectRoot, "public", "liblouis");
const destination = join(destinationDirectory, "build-no-tables-utf32.js");

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);

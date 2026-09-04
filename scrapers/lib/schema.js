// Schema loading + validation. Doubles as the `make schema` CLI when run directly.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { logger } from "./log.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..");
export const SCHEMA_PATH = join(REPO_ROOT, "schema", "model.schema.json");
export const DATA_DIR = join(REPO_ROOT, "data");

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
}

export function schemaVersion(schema = loadSchema()) {
  return schema.properties.schema_version.const;
}

/** Compile the schema once; returns an ajv validate function with `.errors`. */
export function compileValidator(schema = loadSchema()) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function listDataFiles() {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(DATA_DIR, f));
}

export function readDataFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Validate one parsed data document.
 * @returns {{ok: boolean, errors: Array<{path: string, message: string, params: object}>}}
 */
export function validateDocument(validate, doc) {
  const ok = validate(doc);
  const errors = (validate.errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: e.message ?? "",
    params: e.params,
  }));
  return { ok, errors };
}

function main() {
  const log = logger("schema");
  const schema = loadSchema();
  const validate = compileValidator(schema);
  const files = listDataFiles();
  let failures = 0;
  for (const file of files) {
    const doc = readDataFile(file);
    const { ok, errors } = validateDocument(validate, doc);
    if (ok) {
      log.info("valid", { file, models: doc.models.length });
    } else {
      failures++;
      for (const e of errors) {
        log.error("schema violation", { file, ...e });
      }
    }
  }
  if (failures > 0) {
    log.error("schema check failed", { files: files.length, failing: failures });
    process.exit(1);
  }
  log.info("schema check passed", { files: files.length, schema_version: schemaVersion(schema) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

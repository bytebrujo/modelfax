// Every data file validates against schema/model.schema.json and echoes its version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";
import {
  loadSchema,
  compileValidator,
  listDataFiles,
  readDataFile,
  validateDocument,
  schemaVersion,
} from "../scrapers/lib/schema.js";

const schema = loadSchema();
const validate = compileValidator(schema);
const files = listDataFiles();

test("schema compiles and declares $id + version const", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.match(schema.$id, /^https:\/\//);
  assert.match(schemaVersion(schema), /^\d+\.\d+\.\d+$/);
});

test("there is at least one data file", () => {
  assert.ok(files.length >= 1);
});

for (const file of files) {
  test(`${basename(file)} validates against the schema`, () => {
    const doc = readDataFile(file);
    const { ok, errors } = validateDocument(validate, doc);
    assert.ok(ok, JSON.stringify(errors, null, 2));
  });

  test(`${basename(file)} echoes schema_version ${schemaVersion(schema)}`, () => {
    const doc = readDataFile(file);
    assert.equal(doc.schema_version, schemaVersion(schema));
  });

  test(`${basename(file)} is named after its provider`, () => {
    const doc = readDataFile(file);
    const expected = basename(file, ".json");
    for (const m of doc.models) {
      assert.equal(m.provider, expected, `${m.id} has provider ${m.provider}`);
    }
  });
}

test("schema rejects an extra field at the record level", () => {
  const doc = readDataFile(files[0]);
  const bad = structuredClone(doc);
  bad.models[0].surprise = 1;
  assert.equal(validate(bad), false);
});

test("schema rejects pricing null on an available model", () => {
  const doc = readDataFile(files[0]);
  const bad = structuredClone(doc);
  bad.models[0].status = "available";
  bad.models[0].pricing = null;
  assert.equal(validate(bad), false);
});

test("schema rejects an http source", () => {
  const doc = readDataFile(files[0]);
  const bad = structuredClone(doc);
  bad.models[0].sources = ["http://example.com/pricing"];
  assert.equal(validate(bad), false);
});

test("schema rejects a malformed date", () => {
  const doc = readDataFile(files[0]);
  const bad = structuredClone(doc);
  bad.models[0].last_verified = "2026-13-01";
  assert.equal(validate(bad), false);
});

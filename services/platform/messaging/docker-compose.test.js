import { expect, test } from "bun:test";

test("the starter provisions NATS as its only messaging service", async () => {
  const file = Bun.file(new URL("./docker-compose.yml", import.meta.url));
  const compose = Bun.YAML.parse(await file.text());

  expect(Object.keys(compose.services)).toEqual(["nats"]);
  expect(compose.services.nats.command).toContain("-js");
  expect(compose.services.nats.networks).toContain("backend");
});

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { Request, Response } from "express";
import { requestMigrationMiddleware } from "@lib";
import path from "path";

import { resetSingleCallWrapper } from "./single-call";
import { TestExpress, createTestServer } from "./test-express";

describe.skip("apply migrations", () => {
  const migrationsDir = path.join(__dirname, "migrations");
  let app: TestExpress;

  const data = {
    user: {
      email: "test@example.com",
      firstName: "John",
      lastName: "Doe",
      accountType: "premium",
    },
  };

  before(async () => {
    app = createTestServer();
    await app.start();
    app.use(await requestMigrationMiddleware(migrationsDir));
    app.post("/api/users/:id", (req: Request, res: Response) => {
      assert.deepStrictEqual(req.body, data);
      res.send(req.body);
    });
  });

  after(() => {
    app.stop();
  });

  beforeEach(() => {
    resetSingleCallWrapper();
  });

  it("should apply all migrations for an older client", async () => {
    const payload = {
      user: {
        name: `${data.user.firstName} ${data.user.lastName}`,
        account_type: data.user.accountType,
      },
    };
    const { statusCode, body } = await app.makeRequest(
      app.url(),
      "POST",
      "/api/users/123",
      { "x-api-version": "2023-01-01" },
      payload
    );

    assert.strictEqual(statusCode, 200);
    assert.deepStrictEqual(body, payload);
  });

  it("should apply only one migration", async () => {
    const payload = {
      user: {
        accountType: data.user.accountType,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
      },
    };
    const { statusCode, body } = await app.makeRequest(
      app.url(),
      "POST",
      "/api/users/456",
      {
        "x-api-version": "2023-06-15",
      },
      payload
    );

    assert.strictEqual(statusCode, 200);
    assert.deepStrictEqual(body, payload);
  });

  it("should not apply any migration for an up-to-date client", async () => {
    const payload = structuredClone(data);
    const { statusCode, body } = await app.makeRequest(
      app.url(),
      "POST",
      "/api/users/456",
      {
        "x-api-version": "2023-12-15",
      },
      payload
    );

    assert.strictEqual(statusCode, 200);
    assert.deepStrictEqual(body, payload);
  });
});

describe("fail to apply migrations", () => {
  const migrationsDir = path.join(__dirname, "bad-migrations");
  let app: TestExpress;

  before(async () => {
    app = createTestServer();
    await app.start();
    app.use(await requestMigrationMiddleware(migrationsDir));
    app.post("/api/users/:id", (req: Request, res: Response) => {
      res.send(req.body);
    });
  });

  after(() => {
    app.stop();
  });

  it.skip("should handle error during request migration", async () => {
    const { statusCode, body } = await app.makeRequest(
      app.url(),
      "POST",
      "/api/users/123",
      { "x-api-version": "2022-01-01" },
      {}
    );

    assert.strictEqual(statusCode, 500);
    assert.deepStrictEqual(body, {
      error: "Internal Server Error: Failed to apply migrations",
    });
  });

  it("should handle error during response migration", async () => {
    const { statusCode, body } = await app.makeRequest(
      app.url(),
      "POST",
      "/api/users/123",
      { "x-api-version": "2023-01-01" },
      {}
    );

    assert.strictEqual(statusCode, 500);
    assert.deepStrictEqual(body, {
      error: "Internal Server Error: Failed to apply migrations",
    });
  });
});

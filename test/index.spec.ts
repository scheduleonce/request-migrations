import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express, { Request, Response } from "express";
import { requestMigrationMiddleware } from "@lib";
import path from "path";
import http from "http";

const migrationsDir = path.join(__dirname, "migrations");

describe("requestMigrationMiddleware", () => {
  let app: express.Express;
  let server: http.Server;
  let port: number;

  const data = {
    user: {
      email: "test@example.com",
      firstName: "John",
      lastName: "Doe",
      accountType: "premium",
    },
  };

  before(async () => {
    app = express();
    app.use(express.json());
    app.use(await requestMigrationMiddleware(migrationsDir));
    app.post("/api/users/:id", (req: Request, res: Response) => {
      assert.deepStrictEqual(req.body, data);
      res.send(req.body);
    });

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to start server"));
          return;
        }
        port = addr.port;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
  });

  it("should apply all migrations for an older client", async () => {
    const payload = {
      user: {
        name: `${data.user.firstName} ${data.user.lastName}`,
        account_type: data.user.accountType,
      },
    };
    const { statusCode, body } = await makeRequest(
      "POST",
      "/api/users/123",
      { "x-api-version": "2023-01-01" },
      payload
    );

    assert.strictEqual(statusCode, 200);
    assert.deepStrictEqual(body, payload);
  });

  it.skip("should apply only one migration", async () => {
    const payload = {
      user: {
        accountType: data.user.accountType,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
      },
    };
    const { statusCode, body } = await makeRequest(
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

  it.skip("should not apply any migration for an up-to-date client", async () => {
    const payload = structuredClone(data);
    const { statusCode, body } = await makeRequest(
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

  it.skip("should not apply any migration for an up-to-date client", async () => {
    // Define a test route that sends invalid JSON
    app.get("/api/invalid-json", (req: Request, res: Response) => {
      res.setHeader("Content-Type", "application/json");
      res.send("invalid-json"); // Send invalid JSON
    });

    const { statusCode, body } = await makeRequest("GET", "/api/invalid-json", {
      "x-api-version": "2023-01-01",
    });

    assert.strictEqual(statusCode, 500);
    assert.deepStrictEqual(body, {
      error: "Internal Server Error: Invalid response body",
    });
  });

  const makeRequest = async (
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any
  ) => {
    const url = `http://localhost:${port}${path}`;
    const options: RequestInit = {
      method: method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => response.text());
    return { statusCode: response.status, body: data };
  };
});

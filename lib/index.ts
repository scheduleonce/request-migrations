import { Request, Response, NextFunction } from "express";
import path, { basename } from "path";
import { readdir, stat } from "fs/promises";

import { pathToRegexp } from "path-to-regexp";
import util from "util";
const debuglog = util.debuglog("request-migrations");

export interface Migration {
  path: string;
  verbs: string;
  description: string;
  version: string;
  migrateRequest: (req: Request) => Promise<Request>;
  migrateResponse: (req: Request, body: any) => Promise<any>;
}

export const requestMigrationMiddleware = async (
  migrationsDir: string,
  versionHeaderName: string = "x-api-version",
  compareVersions: (v1: string, v2: string) => number = (v1, v2) =>
    v1.localeCompare(v2)
) => {
  const migrations: {
    migration: Migration;
    pathRegex: RegExp;
    verbsRegex: RegExp;
  }[] = [];

  const loadMigrations = async () => {
    const files = await getFiles(migrationsDir);

    for (const file of files) {
      if (file.endsWith(".migration.ts")) {
        const filePath = path.join(migrationsDir, file);

        try {
          const migrationModule = await import(filePath);
          const migration: Migration = migrationModule.default;

          const { regexp: pathRegex } = pathToRegexp(migration.path);
          const verbsRegex = new RegExp(migration.verbs);
          if (!migration.migrateRequest || !migration.migrateResponse) {
            throw new Error(
              `Migration ${file} is missing migrateRequest or migrateResponse function`
            );
          }

          migrations.push({ migration, pathRegex, verbsRegex });
        } catch (error) {
          debuglog(`Error loading migration from ${filePath}:`, error);
          throw error;
        }
      }
    }
    debuglog(
      "Migrations loaded:",
      migrations.map((m) => m.migration.version)
    );
  };
  await loadMigrations();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const httpVerb = req.method.toUpperCase();
      const requestPath = req.path;
      const requestedVersion = (req.headers[versionHeaderName] || "") as string;

      const endpointMigrations = migrations
        // filter migrations that match the request path and verb
        .filter((m) => {
          return m.verbsRegex.test(httpVerb) && m.pathRegex.test(requestPath);
        })
        // filter migrations that are newer than the requested version
        .filter(
          (m) =>
            requestedVersion &&
            compareVersions(m.migration.version, requestedVersion) > 0
        )
        .map((m) => m.migration);

      const requestMigrationsToApply = endpointMigrations.sort((a, b) =>
        compareVersions(a.version, b.version)
      );

      debuglog(
        "Request migrations to apply:",
        requestMigrationsToApply.map((m) => m.version)
      );

      for (const migration of requestMigrationsToApply) {
        debuglog("Applying request migration:", migration.version);
        req = await migration.migrateRequest(req);
      }

      const responseMigrationsToApply = endpointMigrations.sort((a, b) =>
        compareVersions(b.version, a.version)
      );
      debuglog(
        "Response migrations to apply:",
        responseMigrationsToApply.map((m) => m.version)
      );
      const originalSend = res.send.bind(res);
      res.send = function (this: Response, body: any): Response {
        const contentType = res.getHeader("Content-Type");
        const isJson = contentType?.toString().includes("application/json");

        if (!isJson) {
          return originalSend.call(this, body);
        }

        (async () => {
          let dataToMigrate = body;

          if (typeof body === "string") {
            try {
              dataToMigrate = JSON.parse(body);
            } catch (error) {
              console.error("Error parsing response body:", error);
              res.status(500);
              return originalSend.call(this, {
                error: "Internal Server Error: Invalid response body",
              });
            }
          }

          for (const migration of responseMigrationsToApply) {
            debuglog("Applying response migration:", migration.version);
            dataToMigrate = await migration.migrateResponse(req, dataToMigrate);
          }

          const finalBody = JSON.stringify(dataToMigrate);
          originalSend.call(this, finalBody);
        })().catch((error) => {
          console.error("Error during response migration:", error);
          res.status(500);
          return originalSend.call(this, { error: "Internal Server Error" });
        });

        return res;
      };

      next();
    } catch (error) {
      console.error("Error during request or response migration:", error);

      res.status(500).send({
        error: "Internal Server Error: Failed to apply migrations",
      });
    }
  };
};

async function getFiles(path: string): Promise<string[]> {
  const stats = await stat(path);

  if (stats.isDirectory()) {
    return readdir(path);
  } else {
    return [basename(path)];
  }
}

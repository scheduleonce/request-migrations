import { Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import path from "path";
import { pathToRegexp } from "path-to-regexp";

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
    const files = await fs.readdir(migrationsDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const filePath = path.join(migrationsDir, file);

        try {
          const migrationModule = await import(filePath);
          const migration: Migration = migrationModule.default;

          const { regexp: pathRegex } = pathToRegexp(migration.path);
          const verbsRegex = new RegExp(migration.verbs);

          migrations.push({ migration, pathRegex, verbsRegex });
        } catch (error) {
          console.error(`Error loading migration from ${filePath}:`, error);
          // Consider throwing the error here or handling it differently
          // to prevent the server from starting with incomplete migrations
        }
      }
    }
    console.debug(
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

      console.debug(
        "Request migrations to apply:",
        requestMigrationsToApply.map((m) => m.version)
      );

      for (const migration of requestMigrationsToApply) {
        req = await migration.migrateRequest(req);
      }

      const responseMigrationsToApply = endpointMigrations.sort((a, b) =>
        compareVersions(b.version, a.version)
      );
      console.debug(
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

        return new Promise(async (resolve) => {
          let dataToMigrate = body;

          if (typeof body === "string") {
            try {
              dataToMigrate = JSON.parse(body);
            } catch (error) {
              return originalSend.call(this, {
                error: "Internal Server Error: Invalid response body",
              });
            }
          }

          for (const migration of responseMigrationsToApply) {
            console.debug("Applying response migration:", migration.version);
            dataToMigrate = await migration.migrateResponse(req, dataToMigrate);
          }

          resolve(dataToMigrate);
        })
          .then((migratedData) => {
            const finalBody = JSON.stringify(migratedData);
            originalSend.call(this, finalBody);
          })
          .catch((error) => {
            console.error("Error during response migration:", error);
            originalSend.call(this, {
              error: "Internal Server Error: Migration failed",
            });
          });
      };

      next();
    } catch (error) {
      console.error(
        "Error during middleware initialization or request migration:",
        error
      );

      res.status(500).send({
        error:
          "Internal Server Error: Failed to initialize or apply migrations",
      });
    }
  };
};

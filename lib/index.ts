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

      // filter migrations that match the request path and verb
      const endpointMigrations = migrations
        .filter((m) => {
          return m.verbsRegex.test(httpVerb) && m.pathRegex.test(requestPath);
        })
        .map((m) => m.migration);

      const requestedVersion = (req.headers[versionHeaderName] || "") as string;

      endpointMigrations.sort((a, b) => compareVersions(a.version, b.version));

      const requestMigrationsToApply = endpointMigrations.filter(
        (m) =>
          requestedVersion && compareVersions(m.version, requestedVersion) > 0
      );
      console.debug(
        "Request migrations to apply:",
        requestMigrationsToApply.map((m) => m.version)
      );

      for (const migration of requestMigrationsToApply) {
        req = await migration.migrateRequest(req);
      }

      const originalSend = res.send.bind(res);
      res.send = function (this: Response, body: any): Response {
        const contentType = res.getHeader("Content-Type");
        const isJson = contentType?.toString().includes("application/json");

        let responseBody = body;

        if (isJson && typeof body === "string") {
          try {
            responseBody = JSON.parse(body);
          } catch (error) {
            return originalSend.call(this, {
              error: "Internal Server Error: Invalid response body",
            });
          }
        }

        const responseMigrationsToApply = endpointMigrations
          .filter(
            (m) =>
              !requestedVersion ||
              compareVersions(m.version, requestedVersion) > 0
          )
          .sort((a, b) => compareVersions(b.version, a.version));
        console.debug(
          "Response migrations to apply:",
          responseMigrationsToApply.map((m) => m.version)
        );

        const applyMigrations = async (data: any) => {
          let migratedData = data;
          for (const migration of responseMigrationsToApply) {
            migratedData = await migration.migrateResponse(req, migratedData);
          }
          return migratedData;
        };

        if (isJson) {
          applyMigrations(responseBody).then((migratedBody) => {
            const finalBody = JSON.stringify(migratedBody);
            return originalSend.call(this, finalBody);
          });
        } else {
          applyMigrations(responseBody).then((migratedBody) => {
            return originalSend.call(this, migratedBody);
          });
        }

        return this;
      } as any;

      next();
    } catch (error) {
      console.error(
        "Error during middleware initialization or request migration:",
        error
      );
      // Depending on your needs, you might want to handle errors differently here.
      // For example, you could prevent the server from starting if migrations fail to load.
      res.status(500).send({
        error:
          "Internal Server Error: Failed to initialize or apply migrations",
      });
    }
  };
};

# request-migrations

[![Build status](https://github.com/scheduleonce/request-migrations/actions/workflows/node.js.yml/badge.svg)](https://github.com/scheduleonce/request-migrations/actions) [![npm Version](https://badge.fury.io/js/@oncehub%2Frequest-migrations.svg)](https://badge.fury.io/js/@oncehub%2Frequest-migrations) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Rolling versions for your node.js apis

`@oncehub/request-migrations` is a Node.js middleware library for Express that simplifies API versioning by enabling smooth and controlled migrations of both incoming requests and outgoing responses. It allows you to define migrations for different API endpoints and versions, ensuring backward compatibility for older clients while you evolve your API. Read more about the versioning strategy on [Stripe's blog](https://stripe.com/blog/api-versioning).

```
┌─────────┐              ┌───────────────────────────────────────────────────────────────────┐
│         │              │ Your API                                                          │
│         │              │ ┌────────────────────────────────────┐             ┌────────────┐ │
│         │              │ │ request-migrations                 │             │ Codebase   │ │
│         │ v1.0 request │ │ ┌────┐   ┌────┐   ┌────┐   ┌────┐  │v1.3 request │            │ │
│ Client  │ ───────────► │ │ │v1.0├──►│v1.1├──►│v1.2├──►│v1.3│◄─┼─────────────┼─  v1.3     │ │
│         │ v1.0 response│ │ │    │   │    │   │    │   │    │  │v1.3 response│            │ │
│         │ ◄────────────┤ │ │    │◄──┤    │◄──┤    │◄──┤    ├──┼─────────────┼►           │ │
│         │              │ │ └────┘   └────┘   └────┘   └────┘  │             │            │ │
│         │              │ │                                    │             │            │ │
│         │              │ └────────────────────────────────────┘             └────────────┘ │
│         │              │                                                                   │
└─────────┘              └───────────────────────────────────────────────────────────────────┘
```

**Key Features:**

- **Request and Response Migrations:** Define separate migrations for transforming incoming requests and outgoing responses.
- **Endpoint-Specific Migrations:** Organize migrations by API endpoint (path and HTTP verb), making them easy to manage.
- **Version-Based Migrations:** Apply migrations based on the client's requested API version (specified via a header).
- **Dynamic Path Matching:** Supports migrations for routes with dynamic segments (e.g., `/api/users/:id`).
- **Flexible Verb Matching:** Define migrations that apply to multiple HTTP verbs using regular expressions.
- **Sequential Migration Application:** Migrations are applied in the correct order based on their version.
- **Error Handling:** Includes error handling to prevent malformed responses in case of migration issues.

## Installation

```bash
npm install @oncehub/request-migrations
```

## Usage

1.  **Define your migrations:**

    Create a `migrations` directory in your project. Inside, create `.ts` files for each migration, following the naming convention:

    ```
    <migration-description>.migration.ts
    ```

    Example: `split-user-name.migration.ts`

    Each migration file should export a `Migration` object:

    ```ts
    import { Request } from "express";
    import { Migration } from "@oncehub/request-migrations";

    const migration: Migration = {
      path: "/api/users",
      verbs: "POST",
      version: "2023-06-15",
      description: "Separate user name to first and last name",
      migrateRequest: async (req: Request) => {
        if (req.body.name && !req.body.firstName && !req.body.lastName) {
          const [firstName, lastName] = req.body.name.split(" ", 2);
          req.body.firstName = firstName;
          req.body.lastName = lastName || "";
          delete req.body.name;
        }
        return req;
      },
      migrateResponse: async (req: Request, body: any) => {
        if (body.user && body.user.firstName && body.user.lastName) {
          body.user.name = `${body.user.firstName} ${body.user.lastName}`;
          delete body.user.firstName;
          delete body.user.lastName;
        }
        return body;
      },
    };

    export default migration;
    ```

2.  **Integrate the middleware into your Express app:**

    ```ts
    import express from "express";
    import { requestMigrationMiddleware } from "@oncehub/request-migrations";
    import path from "path";

    const app = express();
    app.use(express.json());

    const migrationsDir = path.join(__dirname, "migrations");

    app.use(requestMigrationMiddleware(migrationsDir));

    app.post("/api/users", (req, res) => {
      // ... your route handler
    });

    // ... other routes

    app.listen(3000, () => console.log("Server running on port 3000"));
    ```

## Example Migration

This migration demonstrates how to transform a `name` field in a `POST /api/users` request into separate `firstName` and `lastName` fields for an older API version.
Initial API (version < 2024-06-15):

```json
{
  "name": "John Doe"
}
```

Later, you decided to change it to accept separate firstName and lastName fields:

New API (version >= 2024-06-15):

```json
{
  "firstName": "John",
  "lastName": "Doe"
}
```

Write a migration file:

**`migrations/split-user-name-to-first-and-last-name.migration.ts`:**

```ts
import { Request } from "express";
import { Migration } from "@oncehub/request-migrations";

const migration: Migration = {
  path: "/api/users",
  verbs: "POST",
  version: "2024-06-15",
  description: "Separate user name to first and last name",
  migrateRequest: async (req: Request) => {
    if (req.body.name && !req.body.firstName && !req.body.lastName) {
      const [firstName, lastName] = req.body.name.split(" ", 2);
      req.body.firstName = firstName;
      req.body.lastName = lastName || "";
      delete req.body.name;
    }
    return req;
  },
  migrateResponse: async (req: Request, body: any) => {
    if (body.user && body.user.firstName && body.user.lastName) {
      body.user.name = `${body.user.firstName} ${body.user.lastName}`;
      delete body.user.firstName;
      delete body.user.lastName;
    }
    return body;
  },
};

export default migration;
```

## API Reference

### `requestMigrationMiddleware(migrationsDir, versionHeaderName, compareVersions)`

- **`migrationsDir`:** (`string`) The directory containing your migration files.
- **`versionHeaderName`:** (`string`, optional) The name of the HTTP header used to specify the API version. Defaults to `"x-api-version"`.
- **`compareVersions`:** (`(v1: string, v2: string) => number`, optional) A custom function for comparing version strings. Defaults to lexical comparison.

### `Migration` Interface

- **`path`:** (`string`) The API path this migration applies to (supports dynamic segments using `path-to-regexp` syntax, e.g., `/api/users/:id`).
- **`verbs`:** (`string`) A regular expression specifying the HTTP verbs this migration applies to (e.g., `"(GET|POST)"`).
- **`description`:** (`string`) A brief description of the migration.
- **`version`:** (`string`) The API version this migration is associated with.
- **`migrateRequest`:** (`(req: Request) => Promise<Request>`) An async function that migrates the request object.
- **`migrateResponse`:** (`(req: Request, body: any) => Promise<any>`) An async function that migrates the response body. It receives the potentially modified `req` object as its first argument.

## Acknowledgements

This library was inspired by the following blog posts and other equivalent libraries in other languages:

- https://stripe.com/blog/api-versioning
- https://getconvoy.io/blog/rolling-versions
- https://www.intercom.com/blog/api-versioning
- https://github.com/keygen-sh/request_migrations (Ruby)
- https://github.com/subomi/requestmigrations (Golang)
- https://github.com/tomschlick/request-migrations (Ruby)

## License

This module is licensed under the MIT License. See the LICENSE file for details.

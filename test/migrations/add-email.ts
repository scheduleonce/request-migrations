import { Request } from "express";
import { Migration } from "@lib";

const migration: Migration = {
  path: "/api/users/:id",
  verbs: "GET|POST",
  version: "2023-12-15",
  description: "Add an email to the user object",
  migrateRequest: async (req: Request) => {
    if (!req.body.user?.email) {
      const email = await fetchEmailFromDb(req.params.id);
      req.body.user.email = email;
    }
    return req;
  },
  migrateResponse: async (req: Request, body: any) => {
    if (body.user) {
      delete body.user.email;
    }
    return body;
  },
};

export default migration;

function fetchEmailFromDb(id: string) {
  return Promise.resolve("test@example.com");
}

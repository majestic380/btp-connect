import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: "BTP Connect API", version: "0.2.0" }
    }
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });
}

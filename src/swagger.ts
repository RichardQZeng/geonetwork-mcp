import { Application } from "express";
import swaggerUi from "swagger-ui-express";

const trimTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const buildSwaggerSpec = (baseUrl: string) => {
  const normalizedBase = trimTrailingSlash(baseUrl || "http://localhost:3001");
  const sampleUploadUrl = `${normalizedBase}/uploads/document-1234567890.pdf`;

  return {
    openapi: "3.0.0",
    info: {
      title: "GeoNetwork MCP Server - Upload Basket API",
      version: "2.0.0",
      description:
        "Upload files to the basket for use with the GeoNetwork Catalogue. Upload files here, then use the returned URL with the upload_file_to_record MCP tool to attach them to metadata records.",
      contact: {
        name: "GeoNetwork MCP Maintainers",
      },
    },
    servers: [
      {
        url: normalizedBase,
        description: "Primary MCP server",
      },
    ],
    paths: {
      "/upload": {
        post: {
          summary: "Upload file to basket",
          description:
            "Upload a file to the temporary upload basket. Returns a URL that can be used with the upload_resource_from_url MCP tool.",
          tags: ["Upload Basket"],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "File to upload (max 100MB)",
                    },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "File uploaded successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: {
                        type: "string",
                        example: "File uploaded successfully",
                      },
                      file: {
                        type: "object",
                        properties: {
                          originalName: {
                            type: "string",
                            example: "document.pdf",
                          },
                          filename: {
                            type: "string",
                            example: "document-1234567890.pdf",
                          },
                          size: { type: "number", example: 1024 },
                          mimetype: {
                            type: "string",
                            example: "application/pdf",
                          },
                          url: {
                            type: "string",
                            example: sampleUploadUrl,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - no file uploaded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "No file uploaded" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/uploads/{filename}": {
        get: {
          summary: "Download uploaded file",
          description: "Retrieve a previously uploaded file from the basket",
          tags: ["Upload Basket"],
          parameters: [
            {
              name: "filename",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Filename returned from upload",
              example: "document-1234567890.pdf",
            },
          ],
          responses: {
            "200": {
              description: "File content",
              content: {
                "application/octet-stream": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            "404": {
              description: "File not found",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "File not found" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          description: "Check if the server is running",
          tags: ["System"],
          responses: {
            "200": {
              description: "Server is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      service: { type: "string", example: "geonetwork-mcp" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Upload Basket",
        description: "Temporary file storage for metadata record attachments",
      },
      {
        name: "System",
        description: "System health and information endpoints",
      },
    ],
  } as const;
};

export const createSwaggerSpec = (baseUrl: string) => buildSwaggerSpec(baseUrl);

export const registerSwaggerDocs = (app: Application, spec: object) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "GeoNetwork Upload Basket API",
      customCss: ".swagger-ui .topbar { display: none }",
    })
  );
};

const SwaggerParser = require("./SwaggerParser");
const { http, HttpResponse } = require("msw");
const { setupServer } = require("msw/node");
const ContentParsingError = require("../utils/custom-errors/ContentParsingError");
const ValidationError = require("../utils/custom-errors/ValidationError");
const NetworkError = require("../utils/custom-errors/NetworkError");

describe("SwaggerParser", () => {
  // Sample valid Swagger docs for testing
  const mockSwaggerDoc = {
    swagger: "2.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/test": {
        get: {
          operationId: "getTest",
          tags: ["TestController"],
          summary: "Test endpoint",
          parameters: [{ name: "id", in: "query" }],
          responses: { 200: { description: "OK" } },
        },
        post: {
          operationId: "Controller_postTest", // Should be filtered out
          tags: ["TestController"],
        },
      },
    },
    components: {
      schemas: {
        Test: { type: "object" },
      },
    },
  };

  const validSwaggerYaml = `
    swagger: '2.0'
    info:
      title: Test API
      version: 1.0.0
    paths:
      /test:
        get:
          operationId: getTest
          tags:
            - TestController
  `;

  // Setup MSW server
  const server = setupServer(
    // JSON response
    http.get("https://api.example.com/docs", () => {
      return HttpResponse.json(mockSwaggerDoc);
    }),

    // YAML response
    http.get("https://api.example.com/docs-yaml", () => {
      return new HttpResponse(validSwaggerYaml, {
        headers: {
          "Content-Type": "application/yaml",
        },
      });
    }),

    // Network error simulation
    http.get("https://api.error.com/docs", () => {
      return HttpResponse.error();
    }),

    // Different content types
    http.get("https://api.example.com/docs-string", () => {
      return new HttpResponse(JSON.stringify(mockSwaggerDoc), {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }),
  );

  // Start MSW server before tests
  beforeAll(() => server.listen());

  // Reset handlers after each test
  afterEach(() => server.resetHandlers());

  // Close server after all tests
  afterAll(() => server.close());

  describe("fetchFromUrl", () => {
    it("should fetch and return JSON content from URL", async () => {
      const result = await SwaggerParser.fetchFromUrl(
        "https://api.example.com/docs",
      );
      expect(JSON.parse(result.content)).toEqual(mockSwaggerDoc);
      expect(result.contentType).toContain("application/json");
    });

    it("should fetch and return YAML content from URL", async () => {
      const result = await SwaggerParser.fetchFromUrl(
        "https://api.example.com/docs-yaml",
      );
      expect(result.content).toContain("swagger: '2.0'");
      expect(result.contentType).toContain("application/yaml");
    });

    it("should handle string response data", async () => {
      const result = await SwaggerParser.fetchFromUrl(
        "https://api.example.com/docs-string",
      );
      expect(JSON.parse(result.content)).toEqual(mockSwaggerDoc);
    });

    it("should throw NetworkError on fetch failure", async () => {
      await expect(
        SwaggerParser.fetchFromUrl("https://api.error.com/docs"),
      ).rejects.toThrow(NetworkError);
    });
  });

  describe("processContent", () => {
    it("should process JSON content", () => {
      const result = SwaggerParser.processContent(
        JSON.stringify(mockSwaggerDoc),
      );
      expect(result).toHaveProperty("swagger");
      expect(result).toHaveProperty("paths");
    });

    it("should process YAML content", () => {
      const result = SwaggerParser.processContent(validSwaggerYaml);
      expect(result).toHaveProperty("swagger");
      expect(result).toHaveProperty("paths");
    });

    it("should throw ContentParsingError for invalid content", () => {
      expect(() => SwaggerParser.processContent("invalid content")).toThrow(
        ContentParsingError,
      );
    });
  });

  describe("validateBasicStructure", () => {
    it("should validate swagger v2 document", () => {
      const doc = { swagger: "2.0", info: {}, paths: {} };
      expect(SwaggerParser.validateBasicStructure(doc)).toBe(true);
    });

    it("should validate openapi v3 document", () => {
      const doc = { openapi: "3.0.0", info: {}, paths: {} };
      expect(SwaggerParser.validateBasicStructure(doc)).toBe(true);
    });

    it("should reject invalid document", () => {
      const doc = { invalid: true };
      expect(SwaggerParser.validateBasicStructure(doc)).toBe(false);
    });
  });

  describe("isValidOperation", () => {
    it("should validate correct operation IDs", () => {
      expect(SwaggerParser.isValidOperation("getTest")).toBe(true);
      expect(SwaggerParser.isValidOperation("createUser")).toBe(true);
    });

    it("should reject Controller_ prefixed IDs", () => {
      expect(SwaggerParser.isValidOperation("Controller_getTest")).toBe(false);
    });

    it("should reject empty or undefined IDs", () => {
      expect(SwaggerParser.isValidOperation("")).toBe(false);
      expect(SwaggerParser.isValidOperation(undefined)).toBe(false);
    });
  });

  describe("getControllerName", () => {
    it("should extract controller name from tags", () => {
      expect(SwaggerParser.getControllerName(["UserController"])).toBe(
        "UserController",
      );
    });

    it("should use DefaultController for missing tags", () => {
      expect(SwaggerParser.getControllerName([])).toBe("DefaultController");
      expect(SwaggerParser.getControllerName(undefined)).toBe(
        "DefaultController",
      );
    });
  });

  describe("createOperation", () => {
    it("should create complete operation object", () => {
      const operation = {
        operationId: "getTest",
        summary: "Test endpoint",
        parameters: [{ name: "id" }],
        requestBody: { content: {} },
        responses: { 200: { description: "OK" } },
      };

      const result = SwaggerParser.createOperation("get", "/test", operation);

      expect(result).toEqual({
        method: "get",
        path: "/test",
        operationId: "getTest",
        summary: "Test endpoint",
        parameters: [{ name: "id" }],
        requestBody: { content: {} },
        responses: { 200: { description: "OK" } },
      });
    });

    it("should create minimal operation object", () => {
      const operation = {
        operationId: "getTest",
      };

      const result = SwaggerParser.createOperation("get", "/test", operation);

      expect(result).toEqual({
        method: "get",
        path: "/test",
        operationId: "getTest",
      });
    });
  });

  describe("parse", () => {
    it("should parse JSON string input", async () => {
      const result = await SwaggerParser.parse(JSON.stringify(mockSwaggerDoc));

      expect(result).toHaveProperty("controllers");
      expect(result).toHaveProperty("components");
      expect(result.controllers).toHaveProperty("TestController");
      expect(result.controllers.TestController).toHaveLength(1);
    });

    it("should parse YAML string input", async () => {
      const result = await SwaggerParser.parse(validSwaggerYaml);

      expect(result).toHaveProperty("controllers");
      expect(result.controllers).toHaveProperty("TestController");
    });

    it("should parse from URL input", async () => {
      const result = await SwaggerParser.parse("https://api.example.com/docs");

      expect(result).toHaveProperty("controllers");
      expect(result.controllers).toHaveProperty("TestController");
    });

    it("should throw ValidationError for invalid input", async () => {
      await expect(SwaggerParser.parse(null)).rejects.toThrow(ValidationError);

      await expect(SwaggerParser.parse(123)).rejects.toThrow(ValidationError);
    });

    it("should throw ValidationError for invalid swagger structure", async () => {
      const invalidSwagger = JSON.stringify({ invalid: true });
      await expect(SwaggerParser.parse(invalidSwagger)).rejects.toThrow(
        ValidationError,
      );
    });

    it("should handle network errors", async () => {
      await expect(
        SwaggerParser.parse("https://api.error.com/docs"),
      ).rejects.toThrow(NetworkError);
    });
  });

  describe("organizeControllers", () => {
    it("should organize operations by controller", () => {
      const result = SwaggerParser.organizeControllers(mockSwaggerDoc);

      expect(result.controllers).toHaveProperty("TestController");
      expect(result.components).toHaveProperty("schemas");
      expect(result.controllers.TestController[0]).toHaveProperty(
        "operationId",
        "getTest",
      );
    });

    it("should filter out invalid operations", () => {
      const result = SwaggerParser.organizeControllers(mockSwaggerDoc);

      const hasInvalidOperation = result.controllers.TestController.some(
        (op) => op.operationId === "Controller_postTest",
      );
      expect(hasInvalidOperation).toBe(false);
    });

    it("should throw ValidationError for invalid swagger doc", () => {
      expect(() => SwaggerParser.organizeControllers(null)).toThrow(
        ValidationError,
      );

      expect(() => SwaggerParser.organizeControllers({})).toThrow(
        ValidationError,
      );
    });
  });
});

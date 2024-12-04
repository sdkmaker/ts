const ContentParsingError = require("../utils/custom-errors/ContentParsingError");
const ValidationError = require("../utils/custom-errors/ValidationError");
const NetworkError = require("../utils/custom-errors/NetworkError");
const parseYaml = require("../helpers/parseYaml");
const isValidUrl = require("../helpers/isValidUrl");
const axios = require("axios");

/**
 * @typedef {Object} Operation
 * @property {string} method - HTTP method
 * @property {string} path - API path
 * @property {string} operationId - Unique operation identifier
 * @property {string} [summary] - Operation summary
 * @property {Array} [parameters] - Operation parameters
 * @property {Object} [requestBody] - Request body specification
 * @property {Object} [responses] - Response specifications
 */

/**
 * @typedef {Object} ParsedControllers
 * @property {Object.<string, Operation[]>} controllers
 * @property {Object} components
 */

class SwaggerParser {
  /**
   * Fetches raw content from URL
   * @param {string} url - URL to fetch from
   * @returns {Promise<{content: string, contentType: string}>}
   */
  static async fetchFromUrl(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          Accept: "application/json, application/yaml, text/yaml",
        },
      });

      return {
        content:
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data),
        contentType: response.headers["content-type"] || "",
      };
    } catch (error) {
      throw new NetworkError(
        "fetchFromUrl",
        "Failed to fetch Swagger documentation",
        error,
      );
    }
  }

  /**
   * Processes content string into object based on format
   * @param {string} content - Content string (JSON or YAML)
   * @returns {object}
   */
  static processContent(content) {
    try {
      // First try JSON as it's faster
      return JSON.parse(content);
    } catch (e) {
      try {
        // Then try YAML
        return parseYaml(content);
      } catch (e) {
        // Throw an error if both formats fail
        throw new ContentParsingError(
          "processContent",
          "Failed to parse content as JSON or YAML",
          {
            attemptedFormats: ["JSON", "YAML"],
          },
        );
      }
    }
  }

  /**
   * Parses Swagger documentation from various formats
   * @param {string} input - URL, JSON string, or YAML string
   * @returns {Promise<object>}
   */
  static async parseToDocObject(input) {
    // Check if input is empty or not a string
    if (!input || typeof input !== "string") {
      throw new ValidationError("parse", "Input is not a valid string");
    }

    let content = input;
    let contentType = "";

    // Handle URL
    if (isValidUrl(input)) {
      const response = await this.fetchFromUrl(input);
      content = response.content;
      contentType = response.contentType;
    }

    // Process the content
    const result = this.processContent(content, contentType);

    // Validate the result
    if (!this.validateBasicStructure(result)) {
      throw new ValidationError(
        "parse",
        "Invalid Swagger/OpenAPI document structure",
      );
    }

    return result;
  }

  /**
   * Validates basic Swagger/OpenAPI structure
   * @param {object} doc - Parsed Swagger documentation
   * @returns {boolean}
   */
  static validateBasicStructure(doc) {
    const requiredFields = ["swagger", "openapi", "info", "paths"];
    return requiredFields.some((field) => doc.hasOwnProperty(field));
  }

  /**
   * Determines if an operation should be included based on its operationId
   * @private
   * @param {string} operationId
   * @returns {boolean}
   */
  static isValidOperation(operationId) {
    return !!operationId && !operationId.includes("Controller_");
  }

  /**
   * Extracts the controller name from operation tags
   * @private
   * @param {Array} tags
   * @returns {string}
   */
  static getControllerName(tags) {
    return tags && tags.length > 0 ? tags[0] : "DefaultController";
  }

  /**
   * Creates an operation object from Swagger path data
   * @private
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} operation - Swagger operation object
   * @returns {Operation}
   */
  static createOperation(method, path, operation) {
    return {
      method,
      path,
      operationId: operation.operationId,
      ...(operation.summary && { summary: operation.summary }),
      ...(operation.parameters && { parameters: operation.parameters }),
      ...(operation.requestBody && { requestBody: operation.requestBody }),
      ...(operation.responses && { responses: operation.responses }),
    };
  }

  /**
   * Processes a single operation from the Swagger document
   * @private
   * @param {Object} controllers - Accumulated controllers object
   * @param {string} path - API path
   * @param {string} method - HTTP method
   * @param {Object} operation - Swagger operation object
   */
  static processOperation(controllers, path, method, operation) {
    if (!this.isValidOperation(operation.operationId)) {
      return;
    }

    const controllerName = this.getControllerName(operation.tags);

    if (!controllers[controllerName]) {
      controllers[controllerName] = [];
    }

    controllers[controllerName].push(
      this.createOperation(method, path, operation),
    );
  }

  /**
   * Organizes Swagger paths into controller-based structure
   * @param {Object} swaggerDoc - Parsed Swagger documentation
   * @returns {ParsedControllers}
   */
  static organizeControllers(swaggerDoc) {
    if (!swaggerDoc || !swaggerDoc.paths) {
      throw new ValidationError(
        "organizeControllers",
        "Invalid Swagger document: missing paths",
      );
    }

    const controllers = {};
    const paths = swaggerDoc.paths;

    Object.entries(paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        this.processOperation(controllers, path, method, operation);
      });
    });

    return {
      controllers,
      components: swaggerDoc.components || {},
      baseUrl: swaggerDoc.servers?.length ? swaggerDoc.servers[0].url : "",
      name: swaggerDoc.info?.title?.replace(" ", ""),
      description: swaggerDoc.info?.description || "",
      version: swaggerDoc.info?.version || "",
    };
  }

  /**
   * Parses and organizes Swagger documentation
   * @param {string} input - URL, JSON string, or YAML string
   * @returns {Promise<ParsedControllers>}
   */
  static async parse(input) {
    const swaggerDoc = await this.parseToDocObject(input);
    return this.organizeControllers(swaggerDoc);
  }
}

module.exports = SwaggerParser;

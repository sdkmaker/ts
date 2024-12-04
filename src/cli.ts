#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import makeSdk from "./makeSdk";

interface SdkOptions {
  swaggerPathOrContent: string; // File path or URL
  outputDir: string;
  packageName: string;
}

const program = new Command();

async function loadConfig(configPath: string): Promise<Partial<SdkOptions>> {
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    if (!config.swaggerPathOrContent || !config.outputDir) {
      throw new Error(
        "Configuration file must include 'swaggerPathOrContent' and 'outputDir'.",
      );
    }

    return config;
  } catch (error: any) {
    console.error(
      `Error reading or validating configuration file: ${error.message}`,
    );
    process.exit(1);
  }
}

program
  .name("sdkmaker")
  .description("Generate TypeScript SDK from Swagger JSON")
  .version("1.0.0");

program
  .command("generate")
  .description("Generate SDK files")
  .option("-s, --swagger <path>", "Path to Swagger JSON file or URL")
  .option("-o, --output <path>", "Output directory for SDK files")
  .option("-p, --package-name <name>", "Package name for the generated SDK")
  .option("-c, --config <path>", "Path to a sdk.json file", "./sdk.json")
  .action(async (options) => {
    const configPath = path.resolve(options.config);
    const fileConfig = (await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false))
      ? await loadConfig(configPath)
      : {};

    const mergedOptions: SdkOptions = {
      swaggerPathOrContent:
        options.swagger || fileConfig.swaggerPathOrContent || "",
      outputDir: options.output || fileConfig.outputDir || "",
      packageName: options.packageName,
    };

    if (!mergedOptions.swaggerPathOrContent || !mergedOptions.outputDir) {
      console.error(
        "Error: 'swaggerPath' and 'outputDir' are required. Specify them in the config file or via CLI options.",
      );
      process.exit(1);
    }

    try {
      console.log(`Generating SDK with options:`, mergedOptions);
      await makeSdk(mergedOptions);
      console.log("SDK generated successfully!");
    } catch (error: any) {
      console.error("Error generating SDK:", error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

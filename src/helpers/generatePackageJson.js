function generatePackageJson({ packageName, version, description }) {
  return JSON.stringify(
    {
      name: packageName,
      version,
      description,
      repository: "",
      homepage: "",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      files: ["dist"],
      scripts: {
        build: "tsc",
        format: "prettier --write .",
        pub: "npm publish --access public",
        prepublishOnly: "npm run build",
      },
      keywords: [],
      author: "",
      license: "ISC",
      devDependencies: {
        prettier: "^3.3.3",
        typescript: "^5.5.4",
      },
      dependencies: {
        axios: "^1.7.3",
        compromise: "^14.14.0",
        natural: "^8.0.1",
        "wink-eng-lite-web-model": "^1.8.0",
        "wink-nlp": "^2.3.0",
      },
    },
    null,
    2,
  );
}

module.exports = generatePackageJson;

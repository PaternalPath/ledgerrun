import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      // Possible errors
      "no-console": "off", // Allow console for CLI
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],

      // Best practices
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "prefer-arrow-callback": "error",

      // Style (minimal, non-intrusive)
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true }],
      "comma-dangle": ["error", "never"]
    }
  }
];

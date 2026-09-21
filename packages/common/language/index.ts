export const LANGUAGE_MAPPING: {
  [key: string]: {
    /** Primary key in the Language table, referenced by DefaultCode. */
    internal: number;
    name: string;
    /** Monaco editor language id. */
    monaco: string;
    /** File extension used for boilerplate lookups under apps/problems. */
    extension: string;
  };
} = {
  js: { internal: 1, name: "Javascript", monaco: "javascript", extension: "js" },
  cpp: { internal: 2, name: "C++", monaco: "cpp", extension: "cpp" },
  rs: { internal: 3, name: "Rust", monaco: "rust", extension: "rs" },
  java: { internal: 4, name: "Java", monaco: "java", extension: "java" },
};

export type SupportedLanguage = keyof typeof LANGUAGE_MAPPING;

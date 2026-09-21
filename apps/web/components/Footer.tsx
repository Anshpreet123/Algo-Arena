import Link from "next/link";
import { SiGithub } from "@icons-pack/react-simple-icons";

const REPO = "https://github.com/Anshpreet123/Algo-Arena";

export const Footer = () => {
  return (
    <footer className="w-full border-t bg-gray-50 dark:bg-gray-900 print:hidden">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-gray-400">&lt;/&gt;</span>
            <span>Algo Arena</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md">
            A competitive programming platform with a self-hosted Docker
            sandbox for code execution and an AI coach for hints and reviews.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <Link
            href={`${REPO}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Docs
          </Link>
          <Link
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source on GitHub"
            className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <SiGithub className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </footer>
  );
};

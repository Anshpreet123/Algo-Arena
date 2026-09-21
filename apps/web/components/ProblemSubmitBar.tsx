"use client";
import Editor from "@monaco-editor/react";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@repo/ui/select";
import { useCallback, useEffect, useState } from "react";
import { LANGUAGE_MAPPING } from "@repo/common/language";
import { STATUS_LABELS, type TestcaseStatus } from "@repo/common/judge";
import axios from "axios";
import { ISubmission, SubmissionTable } from "./SubmissionTable";
import { CheckIcon, CircleX, ClockIcon, Cpu, HelpCircle } from "lucide-react";
import { toast } from "react-toastify";
import { signIn, useSession } from "next-auth/react";
import { Turnstile } from "@marsidev/react-turnstile";
import { HintPanel } from "./HintPanel";
import { SubmissionAnalysis } from "./SubmissionAnalysis";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || "";

enum SubmitStatus {
  SUBMIT = "SUBMIT",
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  FAILED = "FAILED",
}

interface TestcaseView {
  index: number;
  status: TestcaseStatus | "PENDING";
  timeMs?: number;
  memoryKb?: number;
}

export interface IProblem {
  id: string;
  title: string;
  description: string;
  slug: string;
  defaultCode: {
    languageId: number;
    code: string;
  }[];
}

export const ProblemSubmitBar = ({
  problem,
  contestId,
}: {
  problem: IProblem;
  contestId?: string;
}) => {
  const [activeTab, setActiveTab] = useState("problem");

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Tabs
              defaultValue="problem"
              className="rounded-md p-1"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="problem">Submit</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <div className={activeTab === "problem" ? "" : "hidden"}>
          <SubmitProblem problem={problem} contestId={contestId} />
        </div>
        {activeTab === "submissions" && <Submissions problem={problem} />}
      </div>
    </div>
  );
};

function Submissions({ problem }: { problem: IProblem }) {
  const [submissions, setSubmissions] = useState<ISubmission[]>([]);

  useEffect(() => {
    axios
      .get(`/api/submission/bulk?problemId=${problem.id}`)
      .then((response) => setSubmissions(response.data.submissions || []))
      .catch(() => setSubmissions([]));
  }, [problem.id]);

  return <SubmissionTable submissions={submissions} />;
}

function SubmitProblem({
  problem,
  contestId,
}: {
  problem: IProblem;
  contestId?: string;
}) {
  const [language, setLanguage] = useState(
    Object.keys(LANGUAGE_MAPPING)[0] as string,
  );
  const [code, setCode] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>(SubmitStatus.SUBMIT);
  const [testcases, setTestcases] = useState<TestcaseView[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [token, setToken] = useState<string>("");
  const session = useSession();

  useEffect(() => {
    const defaultCode: Record<string, string> = {};
    problem.defaultCode.forEach((entry) => {
      const language = Object.keys(LANGUAGE_MAPPING).find(
        (language) => LANGUAGE_MAPPING[language]?.internal === entry.languageId,
      );
      if (!language) return;
      defaultCode[language] = entry.code;
    });
    setCode(defaultCode);
  }, [problem]);

  const submit = useCallback(async () => {
    setStatus(SubmitStatus.PENDING);
    setSubmissionId(null);
    setTestcases((current) =>
      current.map((testcase) => ({ ...testcase, status: "PENDING" })),
    );

    try {
      // Judging is synchronous now, so this single request returns the final
      // verdict. The old code fired a submit and then polled for up to 25
      // seconds waiting for Judge0's sweeper to catch up.
      const response = await axios.post(`/api/submission/`, {
        code: code[language],
        languageId: language,
        problemId: problem.id,
        activeContestId: contestId,
        token,
      });

      const id: string = response.data.id;
      setSubmissionId(id);

      const detail = await axios.get(`/api/submission/?id=${id}`);
      const submission = detail.data.submission;

      setTestcases(
        (submission.testcases ?? []).map((testcase: TestcaseView) => ({
          index: testcase.index,
          status: testcase.status,
          timeMs: testcase.timeMs,
          memoryKb: testcase.memoryKb,
        })),
      );

      if (submission.status === "AC") {
        setStatus(SubmitStatus.ACCEPTED);
        toast.success("Accepted!");
      } else {
        setStatus(SubmitStatus.FAILED);
        toast.error(
          submission.compileOutput ? "Compilation error" : "Failed :(",
        );
      }
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? "Submission failed";
      toast.error(message);
      setStatus(SubmitStatus.SUBMIT);
    }
  }, [code, language, problem.id, contestId, token]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <Label htmlFor="language">Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(LANGUAGE_MAPPING).map((language) => (
                <SelectItem key={language} value={language}>
                  {LANGUAGE_MAPPING[language]?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {session.data?.user && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHints((visible) => !visible)}
          >
            <HelpCircle className="h-4 w-4 mr-1.5" />
            {showHints ? "Hide hints" : "Stuck? Get a hint"}
          </Button>
        )}
      </div>

      {showHints && session.data?.user && (
        <div className="mt-4">
          <HintPanel
            problemId={problem.id}
            language={language}
            code={code[language] ?? ""}
            contestId={contestId}
          />
        </div>
      )}

      <div className="pt-4 rounded-md">
        <Editor
          height={"60vh"}
          value={code[language] ?? ""}
          theme="vs-dark"
          options={{ fontSize: 14, scrollBeyondLastLine: false }}
          language={LANGUAGE_MAPPING[language]?.monaco}
          onChange={(value) =>
            setCode((current) => ({ ...current, [language]: value ?? "" }))
          }
        />
      </div>

      <div className="flex justify-end items-center gap-3">
        {TURNSTILE_SITE_KEY ? (
          <Turnstile onSuccess={setToken} siteKey={TURNSTILE_SITE_KEY} />
        ) : null}
        <Button
          disabled={status === SubmitStatus.PENDING}
          type="submit"
          className="mt-4"
          onClick={session.data?.user ? submit : () => signIn()}
        >
          {session.data?.user
            ? status === SubmitStatus.PENDING
              ? "Judging..."
              : "Submit"
            : "Login to submit"}
        </Button>
      </div>

      <RenderTestcases testcases={testcases} />

      {submissionId && status !== SubmitStatus.PENDING && (
        <SubmissionAnalysis
          submissionId={submissionId}
          accepted={status === SubmitStatus.ACCEPTED}
        />
      )}
    </div>
  );
}

function statusIcon(status: TestcaseStatus | "PENDING") {
  switch (status) {
    case "AC":
      return <CheckIcon className="h-6 w-6 text-green-500" />;
    case "PENDING":
      return <ClockIcon className="h-6 w-6 text-yellow-500 animate-pulse" />;
    case "TLE":
      return <ClockIcon className="h-6 w-6 text-red-500" />;
    case "MLE":
      return <Cpu className="h-6 w-6 text-red-500" />;
    default:
      return <CircleX className="h-6 w-6 text-red-500" />;
  }
}

function RenderTestcases({ testcases }: { testcases: TestcaseView[] }) {
  if (testcases.length === 0) return null;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
      {testcases.map((testcase) => (
        <div
          key={testcase.index}
          className="border rounded-md p-2 text-center"
          title={
            testcase.status === "PENDING"
              ? "Waiting for the judge"
              : STATUS_LABELS[testcase.status as TestcaseStatus]
          }
        >
          <div className="text-sm">Test #{testcase.index + 1}</div>
          <div className="flex justify-center py-1">
            {statusIcon(testcase.status)}
          </div>
          {typeof testcase.timeMs === "number" && testcase.status !== "PENDING" && (
            <div className="text-[11px] text-muted-foreground">
              {testcase.timeMs}ms
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

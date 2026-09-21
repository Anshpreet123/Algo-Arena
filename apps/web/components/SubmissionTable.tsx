import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@repo/ui/table";
import { CheckIcon, ClockIcon, CircleX } from "lucide-react";

export interface ISubmission {
  id: string;
  status: string;
  language: string;
  time: number | null;
  memory: number | null;
  createdAt: string;
  testcases: {
    index: number;
    status: string;
  }[];
}

function verdict(status: string) {
  switch (status) {
    case "AC":
      return {
        label: "Accepted",
        className: "text-green-600 dark:text-green-500",
        icon: <CheckIcon className="h-4 w-4" />,
      };
    case "PENDING":
      return {
        label: "Judging",
        className: "text-yellow-600 dark:text-yellow-500",
        icon: <ClockIcon className="h-4 w-4" />,
      };
    default:
      return {
        label: "Rejected",
        className: "text-red-600 dark:text-red-500",
        icon: <CircleX className="h-4 w-4" />,
      };
  }
}

/** Raw milliseconds and kilobytes are not units a person reads. */
function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function formatMemory(kb: number | null): string {
  if (!kb) return "—";
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export function SubmissionTable({
  submissions,
}: {
  submissions: ISubmission[];
}) {
  if (submissions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No submissions yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Submission</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Language</TableHead>
            <TableHead>Tests</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Memory</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((submission) => {
            const result = verdict(submission.status);
            const passed = submission.testcases.filter(
              (testcase) => testcase.status === "AC",
            ).length;

            return (
              <TableRow key={submission.id}>
                <TableCell className="font-mono text-xs">
                  {submission.id.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <span
                    className={`flex items-center gap-1.5 font-medium ${result.className}`}
                  >
                    {result.icon}
                    {result.label}
                  </span>
                </TableCell>
                <TableCell className="uppercase text-xs">
                  {submission.language}
                </TableCell>
                <TableCell>
                  {passed}/{submission.testcases.length}
                </TableCell>
                <TableCell>{formatTime(submission.time)}</TableCell>
                <TableCell>{formatMemory(submission.memory)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

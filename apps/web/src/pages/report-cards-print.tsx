import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PrintFrame, PrintPage, SchoolLetterhead, type Letterhead, type PrintLang } from '@/components/print/print-frame';
import { ErrorState, Spinner } from '@/components/ui/states';
import { useClassResults, useExam, type ClassResults, type ExamDto, type StudentResult } from '@/features/exams/exams-api';
import { fmtDate, platformError } from '@/features/platform/common';
import { subjectOutcome, useLetterhead, type PrintT } from '@/features/print/print-api';

export function ReportCardSheet({ school, exam, results, row, tt, lang }: { school: Letterhead; exam: ExamDto; results: ClassResults; row: StudentResult; tt: PrintT; lang: PrintLang }) {
  const bySubject = new Map(row.subjects.map((s) => [s.subjectId, s]));
  const outcome = row.passed === null ? 'incomplete' : row.passed ? 'pass' : 'fail';
  return (
    <>
      <SchoolLetterhead school={school} />
      <h2 className="mt-5 text-center text-xl font-extrabold">{tt('print.report.title')}</h2>
      <p className="text-center text-sm">{exam.name} · {exam.sessionName}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.report.student')}</dt><dd className="font-semibold">{row.student.name}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.report.admissionNo')}</dt><dd className="font-semibold" dir="ltr">{row.student.admissionNo}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.report.class')}</dt><dd className="font-semibold">{results.class.name}{row.student.sectionName ? ` – ${row.student.sectionName}` : ''}</dd></div>
        {exam.publishedAt ? <div className="flex justify-between"><dt className="text-gray-600">{tt('print.report.published')}</dt><dd className="font-semibold">{fmtDate(exam.publishedAt, lang)}</dd></div> : null}
      </dl>
      <table className="mt-5 w-full border-collapse text-sm">
        <thead><tr className="border-y-2 border-black text-start">
          {(['subject', 'totalMarks', 'passMarks', 'obtained', 'percent', 'grade', 'remark'] as const).map((k) => <th key={k} className="py-1.5 pe-2 text-start">{tt(`print.report.cols.${k}`)}</th>)}
        </tr></thead>
        <tbody>
          {results.subjects.map((sub) => {
            const s = bySubject.get(sub.subjectId);
            const o = s ? subjectOutcome(s) : 'pending';
            return (
              <tr key={sub.subjectId} className="border-b border-gray-300">
                <td className="py-1.5 pe-2 font-semibold">{sub.subjectName}</td>
                <td className="pe-2" dir="ltr">{sub.totalMarks}</td><td className="pe-2" dir="ltr">{sub.passMarks}</td>
                <td className="pe-2 font-semibold" dir="ltr">{o === 'absent' ? tt('print.report.absentShort') : s?.entered ? s.marks : '—'}</td>
                <td className="pe-2" dir="ltr">{s?.percentage === null || s?.percentage === undefined ? '—' : `${s.percentage}%`}</td>
                <td className="pe-2">{s?.grade ?? '—'}</td>
                <td className="pe-2">{tt(`print.report.outcome.${o}`)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="print-avoid mt-5 grid grid-cols-2 gap-x-8 gap-y-1 rounded-card border-2 border-black p-4 text-sm">
        <div className="flex justify-between"><span>{tt('print.report.grandTotal')}</span><b dir="ltr">{row.obtained} / {row.total}</b></div>
        <div className="flex justify-between"><span>{tt('print.report.percentage')}</span><b dir="ltr">{row.percentage === null ? '—' : `${row.percentage}%`}</b></div>
        <div className="flex justify-between"><span>{tt('print.report.grade')}</span><b>{row.grade ?? '—'}</b></div>
        <div className="flex justify-between"><span>{tt('print.report.position')}</span><b dir="ltr">{row.position === null ? '—' : row.position}</b></div>
        <div className="col-span-2 flex justify-between border-t border-black pt-1 text-base"><span>{tt('print.report.result')}</span><b>{tt(`print.report.final.${outcome}`)}</b></div>
      </div>
      <div className="print-avoid mt-16 flex justify-between text-sm">
        {(['classTeacher', 'principal', 'parent'] as const).map((k) => <span key={k} className="border-t border-black px-6 pt-1">{tt(`print.report.sign.${k}`)}</span>)}
      </div>
      <p className="mt-6 text-center text-xs text-gray-500">{tt('print.report.computer')}</p>
    </>
  );
}

/** Report cards of a class (or section, or one student with ?studentId=) for a PUBLISHED exam: one A4 page per student. */
export default function ReportCardsPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const classId = params.get('classId') ?? '';
  const sectionId = params.get('sectionId') ?? '';
  const studentId = params.get('studentId') ?? '';
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const exam = useExam(id);
  const results = useClassResults(id, classId || undefined, sectionId || undefined);
  const school = useLetterhead();
  const back = `/app/exams/${id}/results${classId ? `?classId=${classId}` : ''}`;
  const tt = i18n.getFixedT(lang) as unknown as PrintT;
  const err = exam.error ?? results.error ?? school.error;
  if (err) return <ErrorState title={t('platform.errors.generic')} description={platformError(t, err)} onRetry={() => { void exam.refetch(); void results.refetch(); void school.refetch(); }} />;
  if (!exam.data || !results.data || !school.data) return <Spinner />;
  const rows = results.data.students.filter((s) => !studentId || s.student.id === studentId);
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo={back} sheets>
      {exam.data.status !== 'PUBLISHED' ? (
        <p className="no-print rounded-card bg-amber-50 p-4 text-sm font-semibold text-amber-800">{t('print.report.notPublished')} <Link to={back} className="underline">{t('print.toolbar.back')}</Link></p>
      ) : rows.length === 0 ? (
        <p className="no-print rounded-card bg-white p-4 text-sm text-muted">{t('print.report.none')}</p>
      ) : rows.map((row) => (
        <PrintPage key={row.student.id}><ReportCardSheet school={school.data} exam={exam.data} results={results.data} row={row} tt={tt} lang={lang} /></PrintPage>
      ))}
    </PrintFrame>
  );
}

import type { Metadata } from 'next';
import { FunctionAnalyzer } from './components/FunctionAnalyzer';

export const metadata: Metadata = {
  title: 'e(x)plain · OJ Builds',
  description:
    'Type any function and see its derivatives, critical points, holes, asymptotes and limits — with every step shown and checked against your original input.',
};

export default function FunctionAnalyzerPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <FunctionAnalyzer />
    </div>
  );
}

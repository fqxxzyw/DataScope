import { HelpDemo } from '../components/HelpDemo';
export function Help({
  title,
  steps,
  children,
}: {
  title: string;
  steps: string[];
  children: React.ReactNode;
}) {
  return (
    <HelpDemo
      kind="contextmap"
      title={title}
      detail={children}
      demonstration={[title, steps[0] || '', steps[1] || '', steps[2] || '', '']}
    />
  );
}

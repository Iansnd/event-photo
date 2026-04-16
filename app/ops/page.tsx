import OpsClient from './OpsClient';

export const metadata = {
  title: 'ops · euphoria',
  robots: { index: false, follow: false },
};

export default function OpsPage() {
  return <OpsClient />;
}

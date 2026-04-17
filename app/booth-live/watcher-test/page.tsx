import WatcherTestClient from './WatcherTestClient';

export const metadata = {
  title: 'watcher test · booth-live',
  robots: { index: false, follow: false },
};

export default function WatcherTestPage() {
  return <WatcherTestClient />;
}

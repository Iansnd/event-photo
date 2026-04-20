import BoothLiveClient from './BoothLiveClient';

export const metadata = {
  title: 'booth — live mode',
  robots: { index: false, follow: false },
};

export default function BoothLivePage() {
  return <BoothLiveClient />;
}

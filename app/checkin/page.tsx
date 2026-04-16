import CheckinClient from './CheckinClient';

export const metadata = {
  title: 'check-in — euphoria',
};

export default function CheckinPage() {
  const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? 'Euphoria Launch';
  return <CheckinClient eventName={eventName} />;
}

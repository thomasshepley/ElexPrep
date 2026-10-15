import { Link } from 'react-router-dom';
import { usePageTitle } from '../pageTitle';

export default function NotFoundPage({ home = '/' }: { home?: string }) {
  usePageTitle('Page not found');
  return (
    <div className="error-page">
      <h1>Page not found</h1>
      <p className="muted">There's nothing at this address. It may have moved, or the link may be out of date.</p>
      <Link to={home}>Back to the start</Link>
    </div>
  );
}
